/**
 * Uppskattad marginal variabel konsumentkostnad per kWh (öre/kWh inkl. moms).
 * Spot/p50 är ex moms/skatt/nät (som elprisetjustnu/Elfacit).
 * Fasta månadsavgifter (nät/handlare) ingår inte.
 *
 * Källor: SCB TAB3950 elnätspris lägenhet, Skatteverket energiskatt,
 * typiska elcertifikat-/handelspåslag — se docs/elpris-design.md.
 */
(function (global) {
  const VAT = 1.25;
  const FEES_STORAGE_KEY = 'elpris-inkl-avgifter';
  const NET_PROFILE_STORAGE_KEY = 'elpris-natprofil';

  const ZONE_GRID_ORE_EX = {
    SE1: 88,
    SE2: 95,
    SE3: 112,
    SE4: 118,
  };

  const ZONE_GRID_VILLA_ORE_EX = {
    SE1: 72,
    SE2: 78,
    SE3: 98,
    SE4: 105,
  };

  const ZONE_ENERGY_TAX_ORE_EX = {
    SE1: 14.5,
    SE2: 36,
    SE3: 36,
    SE4: 36,
  };

  const CERTIFICATE_ORE_EX = 2.5;
  const RETAIL_VARIABLE_ORE_EX = 6;

  const NET_PROFILES = {
    lagenhet: {
      id: 'lagenhet',
      label: 'Lägenhet (zonmedel)',
      gridByZone: ZONE_GRID_ORE_EX,
    },
    villa: {
      id: 'villa',
      label: 'Villa (zonmedel)',
      gridByZone: ZONE_GRID_VILLA_ORE_EX,
    },
  };

  function variableExParts(spotOreEx, zone, profileId = 'lagenhet') {
    const spotEx = spotOnlyOre(spotOreEx);
    const profile = NET_PROFILES[profileId] ?? NET_PROFILES.lagenhet;
    const gridEx = profile.gridByZone[zone] ?? ZONE_GRID_ORE_EX.SE3;
    const taxEx = ZONE_ENERGY_TAX_ORE_EX[zone] ?? 36;
    const bundleEx =
      spotEx + gridEx + taxEx + CERTIFICATE_ORE_EX + RETAIL_VARIABLE_ORE_EX;
    return {
      spotEx,
      gridEx,
      taxEx,
      certEx: CERTIFICATE_ORE_EX,
      retailEx: RETAIL_VARIABLE_ORE_EX,
      bundleEx,
    };
  }

  /** Moms på hela variabla paketet (spot + nät + skatt + cert + handel), ex-rader. */
  function variableBundleVatOre(bundleEx) {
    return Math.round(bundleEx * (VAT - 1));
  }

  function consumerTotalOre(spotOreEx, zone, profileId = 'lagenhet') {
    const { bundleEx } = variableExParts(spotOreEx, zone, profileId);
    return Math.round(bundleEx * VAT);
  }

  function consumerTotalFromForecastBand(pOreEx, zone, profileId) {
    return consumerTotalOre(pOreEx, zone, profileId);
  }

  function spotOnlyOre(spotOreEx) {
    return Math.round(Number(spotOreEx));
  }

  /** Tillägg inkl. moms ovanpå spot öre ex moms (variabla avgifter + moms). */
  function feeAddonOre(spotOreEx, zone, profileId = 'lagenhet') {
    const spot = spotOnlyOre(spotOreEx);
    return consumerTotalOre(spotOreEx, zone, profileId) - spot;
  }

  function feeAddonDetailLine(spotOreEx, zone, profileId = 'lagenhet') {
    const lines = feeBreakdownLines(spotOreEx, zone, profileId).filter((l) => l.kind !== 'spot');
    return lines.map((l) => `${l.label.toLowerCase()} ${l.value}`).join(', ');
  }

  /**
   * Pivot: spot + avgifter **ex moms**, en moms-rad på hela paketet, inga per-rad ×1,25.
   * @returns {Array<{label:string,value:number,exMoms:boolean,kind:'spot'|'fee'|'vat'}>}
   */
  function feeBreakdownLines(spotOreEx, zone, profileId = 'lagenhet') {
    const { spotEx, gridEx, taxEx, certEx, retailEx, bundleEx } = variableExParts(
      spotOreEx,
      zone,
      profileId,
    );
    const vatOre = variableBundleVatOre(bundleEx);
    return [
      { label: 'Elpris (spot)', value: spotEx, exMoms: true, kind: 'spot' },
      { label: 'Elnät (variabel)', value: gridEx, exMoms: true, kind: 'fee' },
      { label: 'Energiskatt', value: taxEx, exMoms: true, kind: 'fee' },
      { label: 'Elcertifikat', value: certEx, exMoms: true, kind: 'fee' },
      { label: 'Handel (rörligt)', value: retailEx, exMoms: true, kind: 'fee' },
      { label: 'Moms (25 %)', value: vatOre, exMoms: false, kind: 'vat' },
    ];
  }

  function feePivotData(spotOreEx, zone, profileId = 'lagenhet') {
    const lines = feeBreakdownLines(spotOreEx, zone, profileId);
    const spotLine = lines.find((l) => l.kind === 'spot') ?? lines[0];
    const feeLines = lines.filter((l) => l.kind === 'fee' || l.kind === 'vat');
    const total = consumerTotalOre(spotOreEx, zone, profileId);
    const spotEx = spotLine.value;
    // Tillägg inkl. moms ovanpå spot ex (nät, skatt, cert, handel + moms) — ej dubbelräkning.
    const addonSum = total - spotEx;

    const partsSum = spotEx + feeLines.reduce((sum, line) => sum + line.value, 0);
  /*
    partsSum avrundas ibland ±1 öre mot total eftersom total = round(bundle×1,25)
    medan moms-raden är round(bundle×0,25); spotEx + addonSum ska alltid matcha total.
   */
    if (Math.abs(spotEx + addonSum - total) > 0) {
      console.warn('[ElprisFees] spot + addonSum !== total', { spotEx, addonSum, total });
    }
    if (Math.abs(partsSum - total) > 1) {
      console.warn('[ElprisFees] pivot parts vs total > 1 öre', { partsSum, total, spotOreEx, zone });
    }

    return { spotLine, feeLines, addonSum, total };
  }

  function feeBreakdownHint(zone, profileId = 'lagenhet') {
    const profile = NET_PROFILES[profileId] ?? NET_PROFILES.lagenhet;
    const grid = profile.gridByZone[zone] ?? ZONE_GRID_ORE_EX.SE3;
    const tax = ZONE_ENERGY_TAX_ORE_EX[zone] ?? 36;
    return (
      `Spot, nät ~${grid}, skatt ${tax} och cert/handels-påslag visas **ex moms**; ` +
      'moms 25 % beräknas en gång på (spot+nät+skatt+cert+handel). ' +
      'Summa avgifter = totalt minus spot ex. Endast variabla delar — inga fasta månadsavgifter. ' +
      'Nätsiffran är zonmedel, inte din adress.'
    );
  }

  function loadIncludeFeesPreference() {
    try {
      const v = localStorage.getItem(FEES_STORAGE_KEY);
      if (v === '0' || v === 'false') return false;
      if (v === '1' || v === 'true') return true;
    } catch {
      /* ignore */
    }
    return true;
  }

  function saveIncludeFeesPreference(on) {
    try {
      localStorage.setItem(FEES_STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function loadNetProfileId() {
    try {
      const v = localStorage.getItem(NET_PROFILE_STORAGE_KEY);
      if (v && NET_PROFILES[v]) return v;
    } catch {
      /* ignore */
    }
    return 'lagenhet';
  }

  function saveNetProfileId(id) {
    try {
      localStorage.setItem(NET_PROFILE_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  global.ElprisFees = {
    consumerTotalOre,
    consumerTotalFromForecastBand,
    spotOnlyOre,
    feeAddonOre,
    feeAddonDetailLine,
    feeBreakdownLines,
    feePivotData,
    feeBreakdownHint,
    loadIncludeFeesPreference,
    saveIncludeFeesPreference,
    loadNetProfileId,
    saveNetProfileId,
    NET_PROFILES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
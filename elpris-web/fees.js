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

  function consumerTotalOre(spotOreEx, zone, profileId = 'lagenhet') {
    const profile = NET_PROFILES[profileId] ?? NET_PROFILES.lagenhet;
    const gridEx = profile.gridByZone[zone] ?? ZONE_GRID_ORE_EX.SE3;
    const taxEx = ZONE_ENERGY_TAX_ORE_EX[zone] ?? 36;
    const variableEx =
      Number(spotOreEx) + gridEx + taxEx + CERTIFICATE_ORE_EX + RETAIL_VARIABLE_ORE_EX;
    return Math.round(variableEx * VAT);
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
    const profile = NET_PROFILES[profileId] ?? NET_PROFILES.lagenhet;
    const gridEx = profile.gridByZone[zone] ?? ZONE_GRID_ORE_EX.SE3;
    const taxEx = ZONE_ENERGY_TAX_ORE_EX[zone] ?? 36;
    const gridInkl = Math.round(gridEx * VAT);
    const taxInkl = Math.round(taxEx * VAT);
    const certHandInkl = Math.round((CERTIFICATE_ORE_EX + RETAIL_VARIABLE_ORE_EX) * VAT);
    const momsEl = Math.round(spotOnlyOre(spotOreEx) * (VAT - 1));
    return `+ elnät ${gridInkl}, skatt ${taxInkl}, cert/hand ${certHandInkl}, moms ${momsEl} öre/kWh`;
  }

  function feeBreakdownHint(zone, profileId = 'lagenhet') {
    const profile = NET_PROFILES[profileId] ?? NET_PROFILES.lagenhet;
    const grid = profile.gridByZone[zone] ?? ZONE_GRID_ORE_EX.SE3;
    const tax = ZONE_ENERGY_TAX_ORE_EX[zone] ?? 36;
    return (
      `Spot + nät ~${grid} + skatt ${tax} + cert/handels-påslag öre/kWh (ex moms), ` +
      '× moms 25 %. Endast variabla delar — fasta månadsavgifter ingår inte. ' +
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
    feeBreakdownHint,
    loadIncludeFeesPreference,
    saveIncludeFeesPreference,
    loadNetProfileId,
    saveNetProfileId,
    NET_PROFILES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
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
  const LEGACY_FEES_STORAGE_KEY = 'elpris-inkl-avgifter';
  const GRID_STORAGE_KEY = 'elpris-inkl-overforing';
  const ADDONS_STORAGE_KEY = 'elpris-inkl-skatt-paslag';
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

  const DEFAULT_TOGGLES = { includeGrid: true, includeAddons: true };

  function normalizeToggles(toggles = DEFAULT_TOGGLES) {
    return {
      includeGrid: toggles.includeGrid !== false,
      includeAddons: toggles.includeAddons !== false,
    };
  }

  function variableExParts(spotOreEx, zone, profileId = 'lagenhet') {
    const spotEx = spotOnlyOre(spotOreEx);
    const profile = NET_PROFILES[profileId] ?? NET_PROFILES.lagenhet;
    const gridEx = profile.gridByZone[zone] ?? ZONE_GRID_ORE_EX.SE3;
    const taxEx = ZONE_ENERGY_TAX_ORE_EX[zone] ?? 36;
    return {
      spotEx,
      gridEx,
      taxEx,
      certEx: CERTIFICATE_ORE_EX,
      retailEx: RETAIL_VARIABLE_ORE_EX,
    };
  }

  function enabledBundleEx(parts, toggles = DEFAULT_TOGGLES) {
    const { includeGrid, includeAddons } = normalizeToggles(toggles);
    let bundleEx = parts.spotEx;
    if (includeGrid) bundleEx += parts.gridEx;
    if (includeAddons) bundleEx += parts.taxEx + parts.certEx + parts.retailEx;
    return bundleEx;
  }

  /** Moms på aktiverat paket (spot + inkluderade ex-komponenter). */
  function variableBundleVatOre(bundleEx) {
    return Math.round(bundleEx * (VAT - 1));
  }

  function consumerTotalOre(
    spotOreEx,
    zone,
    profileId = 'lagenhet',
    toggles = DEFAULT_TOGGLES,
  ) {
    const parts = variableExParts(spotOreEx, zone, profileId);
    const { includeGrid, includeAddons } = normalizeToggles(toggles);
    if (!includeGrid && !includeAddons) return parts.spotEx;
    const bundleEx = enabledBundleEx(parts, toggles);
    return Math.round(bundleEx * VAT);
  }

  function consumerTotalFromForecastBand(pOreEx, zone, profileId, toggles = DEFAULT_TOGGLES) {
    return consumerTotalOre(pOreEx, zone, profileId, toggles);
  }

  function spotOnlyOre(spotOreEx) {
    return Math.round(Number(spotOreEx));
  }

  /** Tillägg inkl. moms ovanpå spot öre ex moms (aktiverade delar + moms). */
  function feeAddonOre(spotOreEx, zone, profileId = 'lagenhet', toggles = DEFAULT_TOGGLES) {
    const spot = spotOnlyOre(spotOreEx);
    return consumerTotalOre(spotOreEx, zone, profileId, toggles) - spot;
  }

  function feeAddonDetailLine(spotOreEx, zone, profileId = 'lagenhet', toggles = DEFAULT_TOGGLES) {
    const lines = feeBreakdownLines(spotOreEx, zone, profileId, toggles).filter(
      (l) => l.kind !== 'spot' && l.active,
    );
    return lines.map((l) => `${l.label.toLowerCase()} ${l.value}`).join(', ');
  }

  /**
   * Pivot: spot + avgifter **ex moms**, en moms-rad på aktiverat paket.
   * @returns {Array<{label:string,value:number,exMoms:boolean,kind:string,category:string,active:boolean}>}
   */
  function feeBreakdownLines(spotOreEx, zone, profileId = 'lagenhet', toggles = DEFAULT_TOGGLES) {
    const parts = variableExParts(spotOreEx, zone, profileId);
    const { includeGrid, includeAddons } = normalizeToggles(toggles);
    const bundleEx = enabledBundleEx(parts, toggles);
    const vatOre = variableBundleVatOre(bundleEx);
    const feesActive = includeGrid || includeAddons;
    return [
      { label: 'Elpris (spot)', value: parts.spotEx, exMoms: true, kind: 'spot', category: 'spot', active: true },
      {
        label: 'Elnät (överföring)',
        value: parts.gridEx,
        exMoms: true,
        kind: 'fee',
        category: 'grid',
        active: includeGrid,
      },
      {
        label: 'Energiskatt',
        value: parts.taxEx,
        exMoms: true,
        kind: 'fee',
        category: 'addons',
        active: includeAddons,
      },
      {
        label: 'Elcertifikat',
        value: parts.certEx,
        exMoms: true,
        kind: 'fee',
        category: 'addons',
        active: includeAddons,
      },
      {
        label: 'Handel (rörligt)',
        value: parts.retailEx,
        exMoms: true,
        kind: 'fee',
        category: 'addons',
        active: includeAddons,
      },
      {
        label: 'Moms (25 %)',
        value: vatOre,
        exMoms: false,
        kind: 'vat',
        category: 'vat',
        active: feesActive,
      },
    ];
  }

  function feePivotData(spotOreEx, zone, profileId = 'lagenhet', toggles = DEFAULT_TOGGLES) {
    const lines = feeBreakdownLines(spotOreEx, zone, profileId, toggles);
    const spotLine = lines.find((l) => l.kind === 'spot') ?? lines[0];
    const feeLines = lines.filter((l) => l.kind === 'fee' || l.kind === 'vat');
    const total = consumerTotalOre(spotOreEx, zone, profileId, toggles);
    const spotEx = spotLine.value;
    const addonSum = total - spotEx;

    const activeFeeLines = feeLines.filter((l) => l.active);
    const partsSum = spotEx + activeFeeLines.reduce((sum, line) => sum + line.value, 0);
    if (Math.abs(spotEx + addonSum - total) > 0) {
      console.warn('[ElprisFees] spot + addonSum !== total', { spotEx, addonSum, total });
    }
    if (Math.abs(partsSum - total) > 1) {
      console.warn('[ElprisFees] pivot parts vs total > 1 öre', {
        partsSum,
        total,
        spotOreEx,
        zone,
        toggles,
      });
    }

    return { spotLine, feeLines, addonSum, total, toggles: normalizeToggles(toggles) };
  }

  function feeBreakdownHint(zone, profileId = 'lagenhet', toggles = DEFAULT_TOGGLES) {
    const profile = NET_PROFILES[profileId] ?? NET_PROFILES.lagenhet;
    const grid = profile.gridByZone[zone] ?? ZONE_GRID_ORE_EX.SE3;
    const tax = ZONE_ENERGY_TAX_ORE_EX[zone] ?? 36;
    const { includeGrid, includeAddons } = normalizeToggles(toggles);
    const parts = [];
    parts.push(
      'Växlar: överföring (elnät) och skatt/påslag är separata. Rader visas alltid; avstängda är nedtonade.',
    );
    if (includeGrid) parts.push(`Överföring ~${grid} öre/kWh ex moms (zonmedel).`);
    if (includeAddons) {
      parts.push(`Skatt ${tax} + cert/handels-påslag ex moms; moms 25 % på aktiverat paket (spot + det du slagit på).`);
    } else if (includeGrid) {
      parts.push('Moms 25 % på spot + överföring.');
    }
    parts.push('Inga fasta månadsavgifter.');
    return parts.join(' ');
  }

  function readLegacyFeesFlag() {
    try {
      const v = localStorage.getItem(LEGACY_FEES_STORAGE_KEY);
      if (v === '0' || v === 'false') return false;
      if (v === '1' || v === 'true') return true;
    } catch {
      /* ignore */
    }
    return null;
  }

  function loadIncludeGridPreference() {
    try {
      const v = localStorage.getItem(GRID_STORAGE_KEY);
      if (v === '0' || v === 'false') return false;
      if (v === '1' || v === 'true') return true;
      const legacy = readLegacyFeesFlag();
      if (legacy !== null) return legacy;
    } catch {
      /* ignore */
    }
    return true;
  }

  function loadIncludeAddonsPreference() {
    try {
      const v = localStorage.getItem(ADDONS_STORAGE_KEY);
      if (v === '0' || v === 'false') return false;
      if (v === '1' || v === 'true') return true;
      const legacy = readLegacyFeesFlag();
      if (legacy !== null) return legacy;
    } catch {
      /* ignore */
    }
    return true;
  }

  function loadFeeTogglePreferences() {
    return {
      includeGrid: loadIncludeGridPreference(),
      includeAddons: loadIncludeAddonsPreference(),
    };
  }

  function saveIncludeGridPreference(on) {
    try {
      localStorage.setItem(GRID_STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function saveIncludeAddonsPreference(on) {
    try {
      localStorage.setItem(ADDONS_STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  /** @deprecated Använd loadFeeTogglePreferences */
  function loadIncludeFeesPreference() {
    const { includeGrid, includeAddons } = loadFeeTogglePreferences();
    return includeGrid && includeAddons;
  }

  /** @deprecated */
  function saveIncludeFeesPreference(on) {
    saveIncludeGridPreference(on);
    saveIncludeAddonsPreference(on);
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
    loadFeeTogglePreferences,
    loadIncludeGridPreference,
    loadIncludeAddonsPreference,
    saveIncludeGridPreference,
    saveIncludeAddonsPreference,
    loadIncludeFeesPreference,
    saveIncludeFeesPreference,
    loadNetProfileId,
    saveNetProfileId,
    NET_PROFILES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
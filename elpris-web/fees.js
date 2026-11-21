/**
 * Uppskattad marginal konsumentkostnad per kWh (öre/kWh inkl. moms).
 * Spot/p50 är ex moms/skatt/nät (som elprisetjustnu/Elfacit).
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

  const ASSUMED_KWH_PER_YEAR = 3000;
  const FIXED_MONTHLY_INKL_KR = { grid: 110, retail: 60 };

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

  function fixedOreInklPerKwh() {
    const annual = (FIXED_MONTHLY_INKL_KR.grid + FIXED_MONTHLY_INKL_KR.retail) * 12;
    return Math.round((annual / ASSUMED_KWH_PER_YEAR) * 100);
  }

  function consumerTotalOre(spotOreEx, zone, profileId = 'lagenhet') {
    const profile = NET_PROFILES[profileId] ?? NET_PROFILES.lagenhet;
    const gridEx = profile.gridByZone[zone] ?? ZONE_GRID_ORE_EX.SE3;
    const taxEx = ZONE_ENERGY_TAX_ORE_EX[zone] ?? 36;
    const variableEx =
      Number(spotOreEx) + gridEx + taxEx + CERTIFICATE_ORE_EX + RETAIL_VARIABLE_ORE_EX;
    const variableInkl = variableEx * VAT;
    return Math.round(variableInkl + fixedOreInklPerKwh());
  }

  function consumerTotalFromForecastBand(pOreEx, zone, profileId) {
    return consumerTotalOre(pOreEx, zone, profileId);
  }

  function feeBreakdownHint(zone, profileId = 'lagenhet') {
    const profile = NET_PROFILES[profileId] ?? NET_PROFILES.lagenhet;
    const grid = profile.gridByZone[zone] ?? ZONE_GRID_ORE_EX.SE3;
    const tax = ZONE_ENERGY_TAX_ORE_EX[zone] ?? 36;
    const fixed = fixedOreInklPerKwh();
    return (
      `Spot + nät ~${grid} + skatt ${tax} + cert/handels-påslag öre/kWh (ex moms), ` +
      `× moms 25 % + fasta avg. ~${fixed} öre/kWh (vid ${ASSUMED_KWH_PER_YEAR} kWh/år). ` +
      `Nätsiffran är zonmedel, inte din adress.`
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
    feeBreakdownHint,
    loadIncludeFeesPreference,
    saveIncludeFeesPreference,
    loadNetProfileId,
    saveNetProfileId,
    NET_PROFILES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
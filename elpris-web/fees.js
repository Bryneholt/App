/**
 * Uppskattad marginal konsumentkostnad per kWh (öre/kWh inkl. moms).
 * Spot/p50 är ex moms/skatt/nät (som elprisetjustnu/Elfacit).
 *
 *Källor: SCB TAB3950 elnätspris lägenhet, Skatteverket energiskatt,
 * typiska elcertifikat-/handelspåslag — se docs/elpris-design.md.
 */

export const VAT = 1.25;
export const FEES_STORAGE_KEY = 'elpris-inkl-avgifter';
export const NET_PROFILE_STORAGE_KEY = 'elpris-natprofil';

/** SCB/TAB3950-inspirerat medelnät per zon (öre/kWh exkl. skatter & moms, lägenhet). */
export const ZONE_GRID_ORE_EX = {
  SE1: 88,
  SE2: 95,
  SE3: 112,
  SE4: 118,
};

/** Villa (~högre överföring) — regionalt skalad från SCB villa utan elvärme. */
export const ZONE_GRID_VILLA_ORE_EX = {
  SE1: 72,
  SE2: 78,
  SE3: 98,
  SE4: 105,
};

/** Energiskatt öre/kWh exkl. moms (2026). SE1: reducerad i stora delar av norr. */
export const ZONE_ENERGY_TAX_ORE_EX = {
  SE1: 14.5,
  SE2: 36,
  SE3: 36,
  SE4: 36,
};

/** Elcertifikat + rörligt handelspåslag (ex moms), typiskt rörligt avtal. */
export const CERTIFICATE_ORE_EX = 2.5;
export const RETAIL_VARIABLE_ORE_EX = 6;

/**
 * Amorterad fast avgift (lägenhet 16A, ~3000 kWh/år) — öre/kWh inkl. moms.
 * Nät ~110 kr/mån + handel ~60 kr/mån (riksgenomsnitt).
 */
export const ASSUMED_KWH_PER_YEAR = 3000;
export const FIXED_MONTHLY_INKL_KR = { grid: 110, retail: 60 };

export const NET_PROFILES = {
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

export function fixedOreInklPerKwh() {
  const annual = (FIXED_MONTHLY_INKL_KR.grid + FIXED_MONTHLY_INKL_KR.retail) * 12;
  return Math.round((annual / ASSUMED_KWH_PER_YEAR) * 100);
}

/**
 * Variabel del inkl. moms + amorterade fasta avgifter.
 * @param {number} spotOreEx - spot eller prognos p50 i öre exkl. moms
 */
export function consumerTotalOre(spotOreEx, zone, profileId = 'lagenhet') {
  const profile = NET_PROFILES[profileId] ?? NET_PROFILES.lagenhet;
  const gridEx = profile.gridByZone[zone] ?? ZONE_GRID_ORE_EX.SE3;
  const taxEx = ZONE_ENERGY_TAX_ORE_EX[zone] ?? 36;
  const variableEx =
    Number(spotOreEx) + gridEx + taxEx + CERTIFICATE_ORE_EX + RETAIL_VARIABLE_ORE_EX;
  const variableInkl = variableEx * VAT;
  return Math.round(variableInkl + fixedOreInklPerKwh());
}

export function consumerTotalFromForecastBand(pOreEx, zone, profileId) {
  return consumerTotalOre(pOreEx, zone, profileId);
}

export function feeBreakdownHint(zone, profileId = 'lagenhet') {
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

export function loadIncludeFeesPreference() {
  try {
    const v = localStorage.getItem(FEES_STORAGE_KEY);
    if (v === '0' || v === 'false') return false;
    if (v === '1' || v === 'true') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function saveIncludeFeesPreference(on) {
  try {
    localStorage.setItem(FEES_STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function loadNetProfileId() {
  try {
    const v = localStorage.getItem(NET_PROFILE_STORAGE_KEY);
    if (v && NET_PROFILES[v]) return v;
  } catch {
    /* ignore */
  }
  return 'lagenhet';
}

export function saveNetProfileId(id) {
  try {
    localStorage.setItem(NET_PROFILE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
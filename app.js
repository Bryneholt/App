(function () {
  const fees = typeof window !== 'undefined' ? window.ElprisFees : null;

  const SPOT_API = 'https://www.elprisetjustnu.se/api/v1/prices';
  const FORECAST_API = 'https://elfacit.se/api/elpris-prognos';
  const STORAGE_KEY = 'elpris-zone';
  const DEFAULT_ZONE = 'SE3';
  const FORECAST_DAYS = 5;
  const TZ = 'Europe/Stockholm';

  const ZONE_NAMES = {
    SE1: 'Luleå / Norra Sverige',
    SE2: 'Sundsvall / Norra Mellansverige',
    SE3: 'Stockholm / Södra Mellansverige',
    SE4: 'Malmö / Södra Sverige',
  };

  function el(id) {
    return id ? document.getElementById(id) : null;
  }

  function setAppStatus(message, kind) {
    const status = el('app-status');
    if (!status) return;
    if (!message) {
      status.hidden = true;
      status.textContent = '';
      status.className = 'app-status';
      return;
    }
    status.hidden = false;
    status.textContent = message;
    status.className = kind ? `app-status app-status--${kind}` : 'app-status';
  }

  if (!fees) {
    setAppStatus('Kunde inte ladda appen (fees.js saknas). Ladda om sidan.', 'error');
    return;
  }

  const {
    consumerTotalOre,
    consumerTotalFromForecastBand,
    feeBreakdownHint,
    loadIncludeFeesPreference,
    saveIncludeFeesPreference,
    loadNetProfileId,
    saveNetProfileId,
    NET_PROFILES,
  } = fees;

  function zoneFromCoordinates(lat, lon) {
    if (lat < 55.2 || lat > 69.2 || lon < 10.5 || lon > 24.3) return null;
    if (lat >= 64.4) return 'SE1';
    if (lat >= 61.0) return 'SE2';
    if (lat < 56.4) return 'SE4';
    if (lat < 57.85 && lon >= 12.4) return 'SE4';
    return 'SE3';
  }

  function stockholmDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const year = get('year');
    const month = get('month');
    const day = get('day');
    return { year, month, day, monthDay: `${month}-${day}`, iso: `${year}-${month}-${day}` };
  }

  function isoKeyOffsetDays(baseIso, offset) {
    const [y, m, d] = baseIso.split('-').map(Number);
    const anchor = new Date(Date.UTC(y, m - 1, d, 12));
    anchor.setUTCDate(anchor.getUTCDate() + offset);
    return stockholmDateParts(anchor).iso;
  }

  function shortDayLabel(isoKey) {
    const [y, m, d] = isoKey.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);
  }

  function formatUpdatedAt(date = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  function krPerKwhToOre(kr) {
    return Math.round(kr * 100);
  }

  function average(nums) {
    if (!nums.length) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  async function fetchSpotDayAverage(zone, isoKey) {
    const year = isoKey.slice(0, 4);
    const monthDay = isoKey.slice(5);
    const url = `${SPOT_API}/${year}/${monthDay}_${zone}.json`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Spot HTTP ${res.status}`);

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const sum = rows.reduce((acc, row) => acc + Number(row.SEK_per_kWh), 0);
    const avgKr = sum / rows.length;
    return {
      avgKr,
      avgOre: krPerKwhToOre(avgKr),
      intervals: rows.length,
      kind: 'spot',
    };
  }

  async function fetchForecastDailyMap(zone) {
    const url = `${FORECAST_API}?zon=${encodeURIComponent(zone)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Prognos HTTP ${res.status}`);

    const body = await res.json();
    const hourly = body.prognos;
    if (!Array.isArray(hourly)) throw new Error('Ogiltigt prognossvar.');

    const byDay = new Map();
    for (const row of hourly) {
      const iso = stockholmDateParts(new Date(row.start)).iso;
      if (!byDay.has(iso)) byDay.set(iso, { p10: [], p50: [], p90: [] });
      const bucket = byDay.get(iso);
      bucket.p10.push(Number(row.p10));
      bucket.p50.push(Number(row.p50));
      bucket.p90.push(Number(row.p90));
    }

    const daily = new Map();
    for (const [iso, vals] of byDay) {
      daily.set(iso, {
        kind: 'forecast',
        avgOre: Math.round(average(vals.p50)),
        p10: Math.round(average(vals.p10)),
        p90: Math.round(average(vals.p90)),
      });
    }

    return { daily, issued: body.utfardad, model: body.modell };
  }

  const els = {
    zoneLabel: el('zone-label'),
    zoneSub: el('zone-sub'),
    todayNumber: el('today-number'),
    todayMeta: el('today-meta'),
    todayBlock: document.querySelector('.price-block--today'),
    tomorrowNumber: el('tomorrow-number'),
    tomorrowMeta: el('tomorrow-meta'),
    tomorrowBadge: el('tomorrow-badge'),
    tomorrowBlock: document.querySelector('.price-block--tomorrow'),
    forecastList: el('forecast-list'),
    forecastNote: el('forecast-note'),
    forecastSub: el('forecast-sub'),
    updatedAt: el('updated-at'),
    zonesHint: el('zones-hint'),
    zoneButtons: document.querySelectorAll('.zone-btn'),
    includeFeesSwitch: el('include-fees'),
    netProfileSelect: el('net-profile'),
    feeHint: el('fee-hint'),
    priceUnits: document.querySelectorAll('.price-unit'),
  };

  let loading = false;
  let activeZone = DEFAULT_ZONE;
  let includeFees = loadIncludeFeesPreference();
  let netProfileId = loadNetProfileId();
  let cachedView = null;
  let initialLoadDone = false;

  function readSavedZone() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && /^SE[1-4]$/.test(saved)) return saved;
    } catch {
      /* ignore */
    }
    return DEFAULT_ZONE;
  }

  function displayOre(spotOreEx) {
    if (!includeFees) return spotOreEx;
    return consumerTotalOre(spotOreEx, activeZone, netProfileId);
  }

  function displayForecastBand(p10, p90) {
    if (!includeFees) return { p10, p90 };
    return {
      p10: consumerTotalFromForecastBand(p10, activeZone, netProfileId),
      p90: consumerTotalFromForecastBand(p90, activeZone, netProfileId),
    };
  }

  function updatePriceModeUi() {
    const unitLabel = includeFees ? 'öre/kWh inkl.' : 'öre/kWh spot';
    els.priceUnits?.forEach((node) => {
      node.textContent = unitLabel;
    });
    if (els.includeFeesSwitch) {
      els.includeFeesSwitch.checked = includeFees;
      els.includeFeesSwitch.setAttribute('aria-checked', includeFees ? 'true' : 'false');
    }
    if (els.feeHint) {
      els.feeHint.textContent = includeFees ? feeBreakdownHint(activeZone, netProfileId) : '';
      els.feeHint.hidden = !includeFees;
    }
    if (els.forecastSub) {
      els.forecastSub.textContent = includeFees
        ? `${FORECAST_DAYS} dagar efter imorgon · uppskattat totalt`
        : `${FORECAST_DAYS} dagar efter imorgon · medel p50 per dygn`;
    }
  }

  function setZoneButtons(zone) {
    els.zoneButtons?.forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.zone === zone ? 'true' : 'false');
    });
  }

  function renderZone(zone, geoNote) {
    activeZone = zone;
    if (els.zoneLabel) els.zoneLabel.textContent = zone;
    if (els.zoneSub) els.zoneSub.textContent = ZONE_NAMES[zone] ?? '';
    if (geoNote && els.zonesHint) els.zonesHint.textContent = geoNote;
    setZoneButtons(zone);
    updatePriceModeUi();
  }

  function setBlockLoading(blocks, on) {
    blocks.filter(Boolean).forEach((b) => b.classList.toggle('is-loading', on));
  }

  function renderFromCache() {
    if (!cachedView) return;
    const { todaySpot, tomorrowSpot, tomorrowIso, forecastDaily, forecast } = cachedView;
    renderToday(todaySpot);
    renderTomorrow(tomorrowSpot, tomorrowIso, forecastDaily);
    renderForecast(forecastDaily, cachedView.todayIso, forecast);
    updatePriceModeUi();
  }

  function renderToday(data) {
    if (!els.todayNumber) return;
    if (!data) {
      els.todayNumber.textContent = '—';
      if (els.todayMeta) els.todayMeta.textContent = 'Kunde inte hämta dagens spot.';
      els.todayBlock?.classList.add('is-error');
      return;
    }
    els.todayBlock?.classList.remove('is-error');
    const shown = displayOre(data.avgOre);
    els.todayNumber.textContent = shown.toLocaleString('sv-SE');
    const krMwh = (data.avgKr * 1000).toLocaleString('sv-SE', { maximumFractionDigits: 0 });
    const spotNote = includeFees ? `spot ${data.avgOre} öre` : `${krMwh} kr/MWh`;
    if (els.todayMeta) els.todayMeta.textContent = `Medel · ${data.intervals} intervall · ${spotNote}`;
  }

  function renderTomorrow(data, tomorrowIso, forecastDaily) {
    if (!els.tomorrowNumber) return;
    els.tomorrowBlock?.classList.remove('is-error');

    if (data?.kind === 'spot') {
      if (els.tomorrowBadge) {
        els.tomorrowBadge.textContent = includeFees ? 'Publicerat' : 'Spot';
        els.tomorrowBadge.className = 'badge badge--spot';
      }
      els.tomorrowNumber.textContent = displayOre(data.avgOre).toLocaleString('sv-SE');
      const suffix = includeFees
        ? `spot ${data.avgOre} öre`
        : `${(data.avgKr * 1000).toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr/MWh`;
      if (els.tomorrowMeta) {
        els.tomorrowMeta.textContent = `${shortDayLabel(tomorrowIso)} · ${suffix}`;
      }
      return;
    }

    const fc = forecastDaily.get(tomorrowIso);
    if (fc) {
      if (els.tomorrowBadge) {
        els.tomorrowBadge.textContent = 'Prognos';
        els.tomorrowBadge.className = 'badge badge--forecast';
      }
      const shown = displayOre(fc.avgOre);
      const band = displayForecastBand(fc.p10, fc.p90);
      els.tomorrowNumber.textContent = shown.toLocaleString('sv-SE');
      const rangeLabel = includeFees ? 'intervall' : 'p10–p90';
      if (els.tomorrowMeta) {
        els.tomorrowMeta.textContent = `${shortDayLabel(tomorrowIso)} · ${band.p10}–${band.p90} öre (${rangeLabel}) · publiceras ~13`;
      }
      return;
    }

    if (els.tomorrowBadge) {
      els.tomorrowBadge.textContent = 'Väntar';
      els.tomorrowBadge.className = 'badge';
    }
    els.tomorrowNumber.textContent = '—';
    if (els.tomorrowMeta) {
      els.tomorrowMeta.textContent = 'Morgondagens spot publiceras cirka kl. 13.';
    }
  }

  function renderForecast(forecastDaily, todayIso, meta) {
    if (!els.forecastList) return;
    els.forecastList.replaceChildren();
    const startOffset = 2;

    for (let i = 0; i < FORECAST_DAYS; i++) {
      const iso = isoKeyOffsetDays(todayIso, startOffset + i);
      const fc = forecastDaily.get(iso);
      const li = document.createElement('li');
      li.className = 'forecast-row';

      const day = document.createElement('span');
      day.className = 'forecast-row__day';
      day.textContent = shortDayLabel(iso);

      const val = document.createElement('span');
      val.className = 'forecast-row__value';
      const displayVal = fc ? displayOre(fc.avgOre) : null;
      val.textContent = displayVal != null ? `${displayVal.toLocaleString('sv-SE')} öre` : '—';

      const range = document.createElement('span');
      range.className = 'forecast-row__range';
      if (fc) {
        const band = displayForecastBand(fc.p10, fc.p90);
        range.textContent = includeFees
          ? `Prognosintervall ${band.p10}–${band.p90} öre/kWh (modell + avgifter)`
          : `Osäkerhetsintervall ${fc.p10}–${fc.p90} öre/kWh spot (utan moms)`;
      } else {
        range.textContent = 'Ingen prognos för denna dag.';
      }

      li.append(day, val, range);
      els.forecastList.append(li);
    }

    const issued = meta?.issued ? `Prognos utfärdad ${meta.issued}` : '';
    const model = meta?.model ? `modell ${meta.model}` : '';
    const mode = includeFees ? feeBreakdownHint(activeZone, netProfileId) : '';
    if (els.forecastNote) {
      els.forecastNote.textContent = [issued, model, mode].filter(Boolean).join(' · ');
    }
  }

  function showLoadError(err) {
    const msg = err?.message || 'Kunde inte hämta elprisdata.';
    setAppStatus(msg, 'error');
    if (els.todayNumber) els.todayNumber.textContent = '—';
    if (els.todayMeta) els.todayMeta.textContent = msg;
    if (els.tomorrowNumber) els.tomorrowNumber.textContent = '—';
    if (els.tomorrowMeta) els.tomorrowMeta.textContent = '';
    if (els.forecastNote) els.forecastNote.textContent = msg;
    els.todayBlock?.classList.add('is-error');
    els.tomorrowBlock?.classList.add('is-error');
  }

  async function loadZone(zone, { geoNote, persist = true } = {}) {
    if (loading) return;
    loading = true;
    renderZone(zone, geoNote);

    const blocks = [els.todayBlock, els.tomorrowBlock];
    setBlockLoading(blocks, true);
    if (els.todayNumber) els.todayNumber.textContent = '…';
    if (els.tomorrowNumber) els.tomorrowNumber.textContent = '…';
    setAppStatus(`Hämtar priser för ${zone} …`, 'loading');
    els.forecastList?.replaceChildren();

    const todayIso = stockholmDateParts().iso;
    const tomorrowIso = isoKeyOffsetDays(todayIso, 1);

    try {
      const [todaySpot, tomorrowSpot, forecast] = await Promise.all([
        fetchSpotDayAverage(zone, todayIso),
        fetchSpotDayAverage(zone, tomorrowIso),
        fetchForecastDailyMap(zone),
      ]);

      cachedView = {
        todaySpot,
        tomorrowSpot,
        tomorrowIso,
        todayIso,
        forecastDaily: forecast.daily,
        forecast,
      };

      renderToday(todaySpot);
      renderTomorrow(tomorrowSpot, tomorrowIso, forecast.daily);
      renderForecast(forecast.daily, todayIso, forecast);
      if (els.updatedAt) els.updatedAt.textContent = `Uppdaterad ${formatUpdatedAt()}`;
      setAppStatus('', null);
      initialLoadDone = true;

      if (persist) {
        try {
          localStorage.setItem(STORAGE_KEY, zone);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      showLoadError(err);
    } finally {
      setBlockLoading(blocks, false);
      loading = false;
    }
  }

  function refineZoneFromGeolocation() {
    const onGpsResult = (detected, hint) => {
      if (els.zonesHint) els.zonesHint.textContent = hint;
      if (detected && detected !== activeZone) {
        loadZone(detected, { geoNote: hint, persist: true });
      }
    };

    if (!navigator.geolocation) {
      if (els.zonesHint) {
        els.zonesHint.textContent = initialLoadDone
          ? 'Plats otillgänglig — välj område nedan.'
          : els.zonesHint.textContent;
      }
      return;
    }

    if (els.zonesHint && !initialLoadDone) {
      els.zonesHint.textContent = 'Hämtar priser … justerar plats i bakgrunden.';
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const detected = zoneFromCoordinates(pos.coords.latitude, pos.coords.longitude);
        if (detected) {
          onGpsResult(detected, 'Elområde utifrån din plats.');
        } else {
          onGpsResult(null, 'Utanför Sverige — visar valt område. Välj SE1–SE4 vid behov.');
        }
      },
      () => {
        if (els.zonesHint) {
          els.zonesHint.textContent = 'Plats nekad — välj SE1–SE4 nedan.';
        }
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
    );
  }

  function bindUi() {
    els.includeFeesSwitch?.addEventListener('change', () => {
      includeFees = els.includeFeesSwitch.checked;
      saveIncludeFeesPreference(includeFees);
      updatePriceModeUi();
      renderFromCache();
    });

    els.netProfileSelect?.addEventListener('change', () => {
      netProfileId = els.netProfileSelect.value;
      if (!NET_PROFILES[netProfileId]) netProfileId = 'lagenhet';
      saveNetProfileId(netProfileId);
      updatePriceModeUi();
      renderFromCache();
    });

    els.zoneButtons?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const zone = btn.dataset.zone;
        if (zone) loadZone(zone, { geoNote: 'Elområde valt manuellt.' });
      });
    });

    if (els.netProfileSelect) {
      for (const id of Object.keys(NET_PROFILES)) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = NET_PROFILES[id].label;
        if (id === netProfileId) opt.selected = true;
        els.netProfileSelect.append(opt);
      }
    }
  }

  function start() {
    includeFees = loadIncludeFeesPreference();
    netProfileId = loadNetProfileId();
    if (els.includeFeesSwitch) els.includeFeesSwitch.checked = includeFees;
    bindUi();
    updatePriceModeUi();

    const initialZone = readSavedZone();
    loadZone(initialZone, {
      geoNote: 'Standardzon tills plats är känd.',
      persist: false,
    });
    refineZoneFromGeolocation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
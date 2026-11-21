/**
 * Minimal SVG price chart — spot (solid) vs prognos (dashed), colored by price level.
 * No external dependencies; mobile-first responsive viewBox.
 */
(function (global) {
  const DAY_LABELS = { yesterday: 'Igår', today: 'Idag', tomorrow: 'Imorgon' };
  const PX_PER_DAY = 88;
  const BASE_W = 360;
  const SEGMENT_GAP_MS = 3 * 3600000;

  const LEVEL_RGB = {
    cheap: [52, 211, 153],
    mid: [250, 204, 21],
    hot: [248, 113, 113],
  };

  function niceStep(max, ticks) {
    const raw = max / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step = mag;
    if (norm <= 1.5) step = mag;
    else if (norm <= 3) step = 2 * mag;
    else if (norm <= 7) step = 5 * mag;
    else step = 10 * mag;
    return Math.max(step, 1);
  }

  function priceStats(points) {
    const ys = points.map((p) => p.y);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    return { min, max, mean };
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function mixRgb(c1, c2, t) {
    const u = Math.max(0, Math.min(1, t));
    return [
      Math.round(lerp(c1[0], c2[0], u)),
      Math.round(lerp(c1[1], c2[1], u)),
      Math.round(lerp(c1[2], c2[2], u)),
    ];
  }

  function colorForValue(y, stats) {
    const { min, max, mean } = stats;
    if (y <= mean) {
      const t = (y - min) / Math.max(mean - min, 1);
      const rgb = mixRgb(LEVEL_RGB.cheap, LEVEL_RGB.mid, t);
      return `rgb(${rgb.join(',')})`;
    }
    const t = (y - mean) / Math.max(max - mean, 1);
    const rgb = mixRgb(LEVEL_RGB.mid, LEVEL_RGB.hot, t);
    return `rgb(${rgb.join(',')})`;
  }

  function splitRuns(points) {
    if (!points.length) return [];
    const runs = [];
    let run = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const gap = points[i].t - points[i - 1].t;
      if (gap > SEGMENT_GAP_MS) {
        runs.push(run);
        run = [];
      }
      run.push(points[i]);
    }
    runs.push(run);
    return runs;
  }

  function destroy(container) {
    if (!container) return;
    container.replaceChildren();
    container.classList.remove('price-chart--has-data');
  }

  function appendMarkers(g, points, xScale, yScale, stats, dashed, radius) {
    const r = radius || 3.5;
    for (const p of points) {
      const color = colorForValue(p.y, stats);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(xScale(p.t)));
      dot.setAttribute('cy', String(yScale(p.y)));
      dot.setAttribute('r', String(r));
      dot.setAttribute('fill', color);
      dot.setAttribute('stroke', dashed ? 'var(--chart-forecast)' : 'var(--bg)');
      dot.setAttribute('stroke-width', dashed ? '1.5' : '1');
      dot.setAttribute('class', dashed
        ? 'price-chart__dot price-chart__dot--forecast'
        : 'price-chart__dot price-chart__dot--spot');
      g.append(dot);
    }
  }

  function appendSegments(g, points, xScale, yScale, yBot, stats, dash, strokeWidth) {
    const sw = strokeWidth || (dash ? 3 : 2.25);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const midY = (a.y + b.y) / 2;
      const color = colorForValue(midY, stats);
      const x1 = xScale(a.t);
      const x2 = xScale(b.t);
      const ya = yScale(a.y);
      const yb = yScale(b.y);
      const yBase = yScale(yBot);

      const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      area.setAttribute(
        'd',
        `M${x1.toFixed(2)},${ya.toFixed(2)} L${x2.toFixed(2)},${yb.toFixed(2)} L${x2.toFixed(2)},${yBase.toFixed(2)} L${x1.toFixed(2)},${yBase.toFixed(2)} Z`,
      );
      area.setAttribute('fill', color);
      area.setAttribute('fill-opacity', '0.2');
      area.setAttribute('class', 'price-chart__segment-area');
      g.append(area);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(ya));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(yb));
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', String(sw));
      line.setAttribute('stroke-linecap', 'round');
      if (dash) line.setAttribute('stroke-dasharray', dash);
      line.setAttribute('class', dash ? 'price-chart__segment-line--forecast' : 'price-chart__segment-line--spot');
      g.append(line);
    }
  }

  function appendSeries(g, points, xScale, yScale, yBot, stats, dash, strokeWidth) {
    const runs = splitRuns(points);
    for (const run of runs) {
      if (run.length >= 2) {
        appendSegments(g, run, xScale, yScale, yBot, stats, dash, strokeWidth);
      } else if (run.length === 1) {
        appendMarkers(g, run, xScale, yScale, stats, !!dash, dash ? 4.5 : 4);
      }
    }
  }

  function appendBoundaryMarkers(g, points, xScale, yScale, stats) {
    const byDay = new Map();
    for (const p of points) {
      const key = p.day || '';
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(p);
    }
    const mids = [];
    for (const pts of byDay.values()) {
      pts.sort((a, b) => a.t - b.t);
      mids.push(pts[Math.floor(pts.length / 2)]);
    }
    appendMarkers(g, mids, xScale, yScale, stats, true, 4);
  }

  function scrollToPrognos(container, prognosScrollT, xScale, viewWidth) {
    const scrollEl = container.querySelector('.price-chart__scroll');
    const hint = container.querySelector('.price-chart__scroll-hint');
    if (!scrollEl) return;

    const apply = () => {
      const overflow = scrollEl.scrollWidth > scrollEl.clientWidth + 4;
      if (hint) hint.hidden = !overflow;
      if (!overflow) {
        scrollEl.scrollLeft = 0;
        return;
      }
      if (prognosScrollT == null) return;
      const frac = xScale(prognosScrollT) / viewWidth;
      const target = frac * scrollEl.scrollWidth - scrollEl.clientWidth * 0.25;
      scrollEl.scrollLeft = Math.max(0, Math.min(target, scrollEl.scrollWidth - scrollEl.clientWidth));
    };

    requestAnimationFrame(() => requestAnimationFrame(apply));
  }

  /**
   * @param {HTMLElement} container
   */
  function render(container, data) {
    destroy(container);
    if (!container || !data) return;

    const spot = data.spot || [];
    const forecast = data.forecast || [];
    if (!spot.length && !forecast.length) {
      const empty = document.createElement('p');
      empty.className = 'price-chart__empty';
      empty.textContent = 'Ingen tidsserie att visa.';
      container.append(empty);
      return;
    }

    const allPoints = [...spot, ...forecast];
    const stats = priceStats(allPoints);

    const allY = allPoints.map((p) => p.y);
    const yMax = Math.max(...allY, 1);
    const yMin = Math.min(0, Math.min(...allY));
    const yPad = (yMax - yMin) * 0.08 || 5;
    const yTop = yMax + yPad;
    const yBot = Math.max(0, yMin - yPad);

    const dayBounds = data.dayBounds || [];
    const dayCount = Math.max(dayBounds.length, 3);
    const W = Math.max(BASE_W, Math.round(dayCount * PX_PER_DAY));
    const H = 200;
    const pad = { l: 36, r: 8, t: 28, b: 32 };
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;

    const tMin = data.tMin;
    const tMax = data.tMax;
    const tSpan = Math.max(tMax - tMin, 1);

    const xScale = (t) => pad.l + ((t - tMin) / tSpan) * innerW;
    const yScale = (y) => pad.t + innerH - ((y - yBot) / (yTop - yBot)) * innerH;

    const step = niceStep(yTop - yBot, 4);
    const y0 = Math.floor(yBot / step) * step;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'price-chart__svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      `Diagram över elpris med färgskala. Spot och prognos. Medel ${Math.round(stats.mean)} öre.`,
    );

    const gGrid = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gGrid.setAttribute('class', 'price-chart__grid');
    for (let y = y0; y <= yTop; y += step) {
      const gy = yScale(y);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(pad.l));
      line.setAttribute('x2', String(W - pad.r));
      line.setAttribute('y1', String(gy));
      line.setAttribute('y2', String(gy));
      gGrid.append(line);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(pad.l - 4));
      label.setAttribute('y', String(gy + 3));
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('class', 'price-chart__ylabel');
      label.textContent = Math.round(y).toLocaleString('sv-SE');
      gGrid.append(label);
    }
    svg.append(gGrid);

    const gDays = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gDays.setAttribute('class', 'price-chart__days');
    for (const band of dayBounds) {
      const x1 = xScale(band.t0);
      const x2 = xScale(band.t1);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(Math.min(x1, x2)));
      rect.setAttribute('y', String(pad.t));
      rect.setAttribute('width', String(Math.abs(x2 - x1)));
      rect.setAttribute('height', String(innerH));
      const bandClass = band.isForecast
        ? 'price-chart__band price-chart__band--forecast-day'
        : `price-chart__band price-chart__band--${band.key}`;
      rect.setAttribute('class', bandClass);
      gDays.append(rect);

      const mid = (x1 + x2) / 2;
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      title.setAttribute('x', String(mid));
      title.setAttribute('y', String(14));
      title.setAttribute('text-anchor', 'middle');
      title.setAttribute('class', band.isForecast
        ? 'price-chart__day-label price-chart__day-label--prognos'
        : 'price-chart__day-label');
      title.textContent = band.label || DAY_LABELS[band.key] || band.key;
      gDays.append(title);
    }
    svg.append(gDays);

    const dividerT = data.prognosScrollT;
    if (dividerT != null) {
      const dx = xScale(dividerT);
      const divider = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      divider.setAttribute('x1', String(dx));
      divider.setAttribute('x2', String(dx));
      divider.setAttribute('y1', String(pad.t));
      divider.setAttribute('y2', String(H - pad.b));
      divider.setAttribute('class', 'price-chart__prognos-divider');
      svg.append(divider);
    }

    const meanY = yScale(stats.mean);
    const meanLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    meanLine.setAttribute('x1', String(pad.l));
    meanLine.setAttribute('x2', String(W - pad.r));
    meanLine.setAttribute('y1', String(meanY));
    meanLine.setAttribute('y2', String(meanY));
    meanLine.setAttribute('class', 'price-chart__mean-line');
    svg.append(meanLine);

    const isDaily = data.mode === 'daily';
    const segmentOpacity = isDaily ? '0.35' : '0.22';

    const gSpot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gSpot.setAttribute('class', 'price-chart__series price-chart__series--spot');
    appendSeries(gSpot, spot, xScale, yScale, yBot, stats, null, 2.25);
    gSpot.querySelectorAll('.price-chart__segment-area').forEach((node) => {
      node.setAttribute('fill-opacity', segmentOpacity);
    });
    if (isDaily) appendMarkers(gSpot, spot, xScale, yScale, stats, false, 4);
    svg.append(gSpot);

    const gFc = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gFc.setAttribute('class', 'price-chart__series price-chart__series--forecast');
    appendSeries(gFc, forecast, xScale, yScale, yBot, stats, '6 4', 3);
    gFc.querySelectorAll('.price-chart__segment-area').forEach((node) => {
      node.setAttribute('fill-opacity', segmentOpacity);
    });
    if (isDaily) {
      appendMarkers(gFc, forecast, xScale, yScale, stats, true, 4.5);
    } else if (forecast.length) {
      appendBoundaryMarkers(gFc, forecast, xScale, yScale, stats);
    }
    svg.append(gFc);

    const gX = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gX.setAttribute('class', 'price-chart__xlabels');
    for (const band of dayBounds) {
      const dayStart = band.t0;
      const hourMarks = band.isForecast ? [12] : [0, 6, 12, 18];
      for (const h of hourMarks) {
        const t = dayStart + h * 3600000;
        if (t > tMax) continue;
        const x = xScale(t);
        const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tx.setAttribute('x', String(x));
        tx.setAttribute('y', String(H - 8));
        tx.setAttribute('text-anchor', 'middle');
        tx.setAttribute('class', 'price-chart__xlabel');
        tx.textContent = band.isForecast ? '12' : `${h}`;
        gX.append(tx);
      }
    }
    svg.append(gX);

    const scrollHint = document.createElement('p');
    scrollHint.className = 'price-chart__scroll-hint';
    scrollHint.hidden = true;
    scrollHint.textContent = 'Svep åt höger för mer prognos →';

    const scroll = document.createElement('div');
    scroll.className = 'price-chart__scroll';
    scroll.setAttribute('tabindex', '0');
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Tidslinje med spot och prognos');
    scroll.append(svg);

    const prognosDays = Math.max(0, dayBounds.filter((b) => b.isForecast).length);
    const typeLegend = document.createElement('div');
    typeLegend.className = 'price-chart__legend price-chart__legend--type';
    typeLegend.setAttribute('role', 'list');
    typeLegend.innerHTML = `
      <span class="price-chart__legend-item" role="listitem">
        <span class="price-chart__swatch price-chart__swatch--spot" aria-hidden="true"></span>
        Spot (auktionerat) · igår–imorgon
      </span>
      <span class="price-chart__legend-item" role="listitem">
        <span class="price-chart__swatch price-chart__swatch--forecast" aria-hidden="true"></span>
        Prognos (modell) · ${forecast.length ? 'synlig' : '—'} · ${prognosDays} dagar
      </span>
    `;

    const scaleLegend = document.createElement('div');
    scaleLegend.className = 'price-chart__scale';
    const cheap = Math.round(stats.min);
    const mean = Math.round(stats.mean);
    const hot = Math.round(stats.max);
    scaleLegend.innerHTML = `
      <p class="price-chart__scale-title">Prisnivå i diagrammet</p>
      <div class="price-chart__scale-bar" aria-hidden="true"></div>
      <div class="price-chart__scale-labels">
        <span>Billigt<br><strong>${cheap}</strong></span>
        <span>Medel<br><strong>${mean}</strong></span>
        <span>Dyrt<br><strong>${hot}</strong></span>
      </div>
      <p class="price-chart__scale-note">Färg relativt min–medel–max · streckad = prognos</p>
    `;

    container.classList.add('price-chart--has-data');
    container.classList.toggle('price-chart--wide', W > BASE_W);
    container.dataset.forecastPoints = String(forecast.length);
    container.append(scrollHint, scroll, scaleLegend, typeLegend);

    scrollToPrognos(container, data.prognosScrollT, xScale, W);
  }

  global.ElprisChart = { render, destroy, colorForValue, priceStats };
})(typeof window !== 'undefined' ? window : globalThis);
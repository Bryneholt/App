/**
 * Minimal SVG price chart — spot (solid) vs prognos (dashed), colored by price level.
 * No external dependencies; mobile-first responsive viewBox.
 */
(function (global) {
  const DAY_LABELS = { yesterday: 'Igår', today: 'Idag', tomorrow: 'Imorgon' };

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
    const span = Math.max(max - min, 1);
    if (y <= mean) {
      const t = (y - min) / Math.max(mean - min, 1);
      const rgb = mixRgb(LEVEL_RGB.cheap, LEVEL_RGB.mid, t);
      return `rgb(${rgb.join(',')})`;
    }
    const t = (y - mean) / Math.max(max - mean, 1);
    const rgb = mixRgb(LEVEL_RGB.mid, LEVEL_RGB.hot, t);
    return `rgb(${rgb.join(',')})`;
  }

  function destroy(container) {
    if (!container) return;
    container.replaceChildren();
    container.classList.remove('price-chart--has-data');
  }

  function appendSegments(g, points, xScale, yScale, yBot, stats, dash) {
    if (points.length < 2) return;
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
      line.setAttribute('stroke-width', '2.25');
      line.setAttribute('stroke-linecap', 'round');
      if (dash) line.setAttribute('stroke-dasharray', dash);
      g.append(line);
    }
  }

  /**
   * @param {HTMLElement} container
   * @param {{ spot: Array<{t:number,y:number}>, forecast: Array<{t:number,y:number}>, tMin: number, tMax: number, unitLabel: string, dayBounds: Array }} data
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

    const W = 360;
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
      `Diagram över elpris med färgskala billigt till dyrt. Spot auktionerat och prognos modell. Medel ${Math.round(stats.mean)} öre.`,
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

    const dayBounds = data.dayBounds || [];
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
      rect.setAttribute('class', `price-chart__band price-chart__band--${band.key}`);
      gDays.append(rect);

      const mid = (x1 + x2) / 2;
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      title.setAttribute('x', String(mid));
      title.setAttribute('y', String(14));
      title.setAttribute('text-anchor', 'middle');
      title.setAttribute('class', 'price-chart__day-label');
      title.textContent = DAY_LABELS[band.key] || band.key;
      gDays.append(title);
    }
    svg.append(gDays);

    const meanY = yScale(stats.mean);
    const meanLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    meanLine.setAttribute('x1', String(pad.l));
    meanLine.setAttribute('x2', String(W - pad.r));
    meanLine.setAttribute('y1', String(meanY));
    meanLine.setAttribute('y2', String(meanY));
    meanLine.setAttribute('class', 'price-chart__mean-line');
    svg.append(meanLine);

    const gSpot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gSpot.setAttribute('class', 'price-chart__series price-chart__series--spot');
    appendSegments(gSpot, spot, xScale, yScale, yBot, stats, null);
    svg.append(gSpot);

    const gFc = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gFc.setAttribute('class', 'price-chart__series price-chart__series--forecast');
    appendSegments(gFc, forecast, xScale, yScale, yBot, stats, '5 4');
    svg.append(gFc);

    const gX = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gX.setAttribute('class', 'price-chart__xlabels');
    const hourMarks = [0, 6, 12, 18];
    for (const band of dayBounds) {
      const dayStart = band.t0;
      for (const h of hourMarks) {
        const t = dayStart + h * 3600000;
        if (t > tMax) continue;
        const x = xScale(t);
        const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tx.setAttribute('x', String(x));
        tx.setAttribute('y', String(H - 8));
        tx.setAttribute('text-anchor', 'middle');
        tx.setAttribute('class', 'price-chart__xlabel');
        tx.textContent = `${h}`;
        gX.append(tx);
      }
    }
    svg.append(gX);

    const typeLegend = document.createElement('div');
    typeLegend.className = 'price-chart__legend price-chart__legend--type';
    typeLegend.setAttribute('role', 'list');
    typeLegend.innerHTML = `
      <span class="price-chart__legend-item" role="listitem">
        <span class="price-chart__swatch price-chart__swatch--spot" aria-hidden="true"></span>
        Spot (auktionerat)
      </span>
      <span class="price-chart__legend-item" role="listitem">
        <span class="price-chart__swatch price-chart__swatch--forecast" aria-hidden="true"></span>
        Prognos (modell)
      </span>
    `;

    const scaleLegend = document.createElement('div');
    scaleLegend.className = 'price-chart__scale';
    scaleLegend.setAttribute('role', 'img');
    scaleLegend.setAttribute(
      'aria-label',
      `Färgskala för synlig period. Lägst ${Math.round(stats.min)}, medel ${Math.round(stats.mean)}, högst ${Math.round(stats.max)} öre.`,
    );
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
      <p class="price-chart__scale-note">Färg relativt min–medel–max i synlig period · streckad = prognos</p>
    `;

    container.classList.add('price-chart--has-data');
    container.dataset.scaleMin = String(cheap);
    container.dataset.scaleMean = String(mean);
    container.dataset.scaleMax = String(hot);
    container.append(svg, scaleLegend, typeLegend);
  }

  global.ElprisChart = { render, destroy, colorForValue, priceStats };
})(typeof window !== 'undefined' ? window : globalThis);
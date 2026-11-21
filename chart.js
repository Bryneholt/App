/**
 * Minimal SVG price chart — spot (solid) vs prognos (dashed).
 * No external dependencies; mobile-first responsive viewBox.
 */
(function (global) {
  const DAY_LABELS = { yesterday: 'Igår', today: 'Idag', tomorrow: 'Imorgon' };

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

  function linePath(points, xScale, yScale) {
    if (!points.length) return '';
    return points
      .map((p, i) => {
        const cmd = i === 0 ? 'M' : 'L';
        return `${cmd}${xScale(p.t).toFixed(2)},${yScale(p.y).toFixed(2)}`;
      })
      .join(' ');
  }

  function destroy(container) {
    if (!container) return;
    container.replaceChildren();
    container.classList.remove('price-chart--has-data');
  }

  /**
   * @param {HTMLElement} container
   * @param {{ spot: Array<{t:number,y:number,day?:string}>, forecast: Array<{t:number,y:number,day?:string}>, tMin: number, tMax: number, unitLabel: string }} data
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

    const allY = [...spot, ...forecast].map((p) => p.y);
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
      `Diagram över elpris. Spot auktionerat och prognos modell. Enhet ${data.unitLabel || 'öre per kilowattimme'}.`,
    );

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', 'spot-fill');
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0');
    grad.setAttribute('y2', '1');
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', 'var(--chart-spot)');
    stop1.setAttribute('stop-opacity', '0.22');
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-opacity', '0');
    grad.append(stop1, stop2);
    defs.append(grad);
    svg.append(defs);

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

    if (spot.length) {
      const spotPath = linePath(spot, xScale, yScale);
      const area = `${spotPath} L${xScale(spot[spot.length - 1].t).toFixed(2)},${yScale(yBot).toFixed(2)} L${xScale(spot[0].t).toFixed(2)},${yScale(yBot).toFixed(2)} Z`;
      const fill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      fill.setAttribute('d', area);
      fill.setAttribute('class', 'price-chart__area');
      fill.setAttribute('fill', 'url(#spot-fill)');
      svg.append(fill);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', spotPath);
      path.setAttribute('class', 'price-chart__line price-chart__line--spot');
      path.setAttribute('fill', 'none');
      svg.append(path);
    }

    if (forecast.length) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', linePath(forecast, xScale, yScale));
      path.setAttribute('class', 'price-chart__line price-chart__line--forecast');
      path.setAttribute('fill', 'none');
      svg.append(path);
    }

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

    const legend = document.createElement('div');
    legend.className = 'price-chart__legend';
    legend.setAttribute('role', 'list');
    legend.innerHTML = `
      <span class="price-chart__legend-item" role="listitem">
        <span class="price-chart__swatch price-chart__swatch--spot" aria-hidden="true"></span>
        Spot (auktionerat)
      </span>
      <span class="price-chart__legend-item" role="listitem">
        <span class="price-chart__swatch price-chart__swatch--forecast" aria-hidden="true"></span>
        Prognos (modell)
      </span>
    `;

    container.classList.add('price-chart--has-data');
    container.append(svg, legend);
  }

  global.ElprisChart = { render, destroy };
})(typeof window !== 'undefined' ? window : globalThis);
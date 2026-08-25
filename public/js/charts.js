let _priceChart = null;

// ── Math helpers ──────────────────────────────────────────────────────────────

function _calcSMA(prices, period) {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    const s = prices.slice(i - period + 1, i + 1);
    return s.reduce((a, b) => a + b, 0) / period;
  });
}

function _calcEMA(prices, period) {
  const k = 2 / (period + 1);
  const result = Array(prices.length).fill(null);
  let prev = null;
  for (let i = 0; i < prices.length; i++) {
    if (prev === null) {
      if (i >= period - 1) {
        prev = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
        result[i] = prev;
      }
    } else {
      prev = prices[i] * k + prev * (1 - k);
      result[i] = prev;
    }
  }
  return result;
}

function _calcBollinger(prices, period = 20, mult = 2) {
  const sma = _calcSMA(prices, period);
  const upper = [], lower = [];
  prices.forEach((_, i) => {
    if (sma[i] === null) { upper.push(null); lower.push(null); return; }
    const slice = prices.slice(i - period + 1, i + 1);
    const variance = slice.reduce((s, p) => s + Math.pow(p - sma[i], 2), 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(sma[i] + mult * sd);
    lower.push(sma[i] - mult * sd);
  });
  return { mid: sma, upper, lower };
}

function _linReg(prices) {
  const n = prices.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += prices[i]; sxy += i * prices[i]; sx2 += i * i; }
  const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx) || 0;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function _sentimentForecast(data, sentScore, range) {
  const prices = data.c;
  const timestamps = data.t;
  const last = prices[prices.length - 1];
  const lastTs = timestamps[timestamps.length - 1];

  // Historical daily volatility from last 20 candles
  const rets = prices.slice(-20).map((p, i, a) => i > 0 ? (p - a[i-1]) / a[i-1] : 0).slice(1);
  const vol = Math.sqrt(rets.reduce((s, r) => s + r * r, 0) / Math.max(rets.length, 1));

  // Map sentiment score (-5..+5) → expected daily drift as multiple of vol
  const norm = Math.max(-5, Math.min(5, sentScore || 0)) / 5;
  const dailyDrift = norm * vol * 2.2;

  const steps = range === '1D' ? 6 : range === '1W' ? 3 : 5;
  const stepSec = range === '1D' ? 300 : range === '1W' ? 3600 : 86400;

  const pts = [];
  for (let d = 1; d <= steps; d++) {
    pts.push({
      ts:       lastTs + d * stepSec,
      expected: last * Math.pow(1 + dailyDrift, d),
      upper:    last * Math.pow(1 + dailyDrift + vol * 0.9, d),
      lower:    last * Math.pow(1 + dailyDrift - vol * 0.9, d),
    });
  }

  const totalPct = ((pts[pts.length - 1].expected - last) / last) * 100;
  return { pts, dailyDrift, vol, direction: dailyDrift >= 0 ? 'bullish' : 'bearish', totalPct };
}

function computeTechnicals(prices) {
  const ema9  = _calcEMA(prices, 9);
  const ema21 = _calcEMA(prices, 21);
  const bb    = _calcBollinger(prices, 20, 2);
  const lr    = _linReg(prices);

  const support    = Math.min(...prices.slice(-30));
  const resistance = Math.max(...prices.slice(-30));
  const last        = prices[prices.length - 1];

  const lastEma9  = ema9[ema9.length - 1];
  const lastEma21 = ema21[ema21.length - 1];
  const prevEma9  = ema9.slice(0, -1).reverse().find(v => v !== null) ?? null;
  const prevEma21 = ema21.slice(0, -1).reverse().find(v => v !== null) ?? null;

  let signal = 'Not enough history yet', biasScore = 0;
  if (lastEma9 !== null && lastEma21 !== null && prevEma9 != null && prevEma21 != null) {
    if (lastEma9 > lastEma21 && prevEma9 <= prevEma21)      { signal = '🟢 Golden Cross';                biasScore = 2; }
    else if (lastEma9 < lastEma21 && prevEma9 >= prevEma21) { signal = '🔴 Death Cross';                 biasScore = -2; }
    else if (lastEma9 > lastEma21)                          { signal = '▲ EMA9 > EMA21 (Bullish bias)';  biasScore = 1; }
    else                                                     { signal = '▼ EMA9 < EMA21 (Bearish bias)'; biasScore = -1; }
  }

  // Bollinger position: price outside the bands suggests overbought/oversold
  const lastBBUpper = bb.upper[bb.upper.length - 1];
  const lastBBLower = bb.lower[bb.lower.length - 1];
  let bbBias = 0;
  if (lastBBUpper != null && last > lastBBUpper) bbBias = -1;
  else if (lastBBLower != null && last < lastBBLower) bbBias = 1;

  // Position within the recent support/resistance range
  const range = (resistance - support) || 1;
  const posInRange = (last - support) / range; // 0 = at support, 1 = at resistance
  let levelBias = 0;
  if (posInRange < 0.15) levelBias = 1;
  else if (posInRange > 0.85) levelBias = -1;

  const slopeBias = lr.slope > 0 ? 1 : lr.slope < 0 ? -1 : 0;

  return { ema9, ema21, bb, lr, support, resistance, signal, biasScore, bbBias, levelBias, slopeBias, posInRange, last };
}

// ── Recommendation: combines technicals + sentiment forecast + analyst data ───

function buildRecommendation(data, sentScore, analystRecs) {
  const prices = data.c;
  const tech = computeTechnicals(prices);
  const fc = _sentimentForecast(data, sentScore, '1Y');

  const techScore = tech.biasScore * 0.5 + tech.bbBias + tech.levelBias + tech.slopeBias * 0.5;
  const techNorm  = Math.max(-1, Math.min(1, techScore / 3));
  const sentNorm  = Math.max(-1, Math.min(1, (sentScore || 0) / 5));

  let analystNorm = null, analystLabel = null;
  if (analystRecs) {
    const total = (analystRecs.strongBuy||0) + (analystRecs.buy||0) + (analystRecs.hold||0) + (analystRecs.sell||0) + (analystRecs.strongSell||0) || 1;
    const sc = ((analystRecs.strongBuy||0)*2 + (analystRecs.buy||0) - (analystRecs.sell||0) - (analystRecs.strongSell||0)*2) / total;
    analystNorm  = Math.max(-1, Math.min(1, sc / 2));
    analystLabel = sc > 1.2 ? 'Strong Buy' : sc > 0.3 ? 'Buy' : sc > -0.3 ? 'Hold' : sc > -1.2 ? 'Sell' : 'Strong Sell';
  }

  const combined = analystNorm !== null
    ? techNorm * 0.40 + sentNorm * 0.35 + analystNorm * 0.25
    : techNorm * 0.55 + sentNorm * 0.45;

  let verdict, icon, color, advice;
  if (combined > 0.5) {
    verdict = 'Strong Buy'; icon = '🚀'; color = '#22c55e';
    advice = 'Technicals, sentiment, and the broader signal set are aligned bullish — a favorable setup to add or open a position near support.';
  } else if (combined > 0.18) {
    verdict = 'Buy'; icon = '🐂'; color = '#86efac';
    advice = 'Multiple signals lean positive. Reasonable to scale into a position, especially on pullbacks toward support.';
  } else if (combined > -0.18) {
    verdict = 'Hold'; icon = '⚖️'; color = '#fbbf24';
    advice = 'Signals are mixed right now. Hold existing positions and wait for a clear break above resistance or below support before acting.';
  } else if (combined > -0.5) {
    verdict = 'Sell'; icon = '🐻'; color = '#f97316';
    advice = 'Technicals and sentiment are leaning bearish — consider trimming into strength or tightening stop-losses.';
  } else {
    verdict = 'Strong Sell'; icon = '🚨'; color = '#ef4444';
    advice = 'Broad bearish alignment across technicals and sentiment points to elevated downside risk.';
  }

  const confidence = Math.abs(combined) > 0.5 ? 'High confidence'
    : Math.abs(combined) > 0.18 ? 'Moderate confidence'
    : 'Low confidence — mixed signals';

  const arrow = fc.direction === 'bullish' ? '▲' : '▼';
  const sentimentText = `${arrow} ${fc.direction.charAt(0).toUpperCase() + fc.direction.slice(1)} (${fc.totalPct >= 0 ? '+' : ''}${fc.totalPct.toFixed(1)}% projected)`;

  return {
    verdict, icon, color, advice, confidence, combined,
    technical: { signal: tech.signal, support: tech.support, resistance: tech.resistance },
    sentiment: { text: sentimentText, direction: fc.direction, pct: fc.totalPct },
    analyst: analystLabel ? { label: analystLabel } : null,
  };
}

// ── Custom candlestick plugin for Chart.js 4.x ────────────────────────────────

const _CANDLE_PLUGIN = {
  id: 'candleOverlay',
  afterDatasetsDraw(chart) {
    if (!chart._ohlcData) return;
    const { ctx, scales } = chart;
    const xScale = scales.x, yScale = scales.y;
    const ohlc = chart._ohlcData;
    const n = ohlc.length;
    if (!n || !xScale || !yScale) return;

    const gap = n > 1
      ? Math.abs(xScale.getPixelForValue(1) - xScale.getPixelForValue(0))
      : (chart.chartArea.right - chart.chartArea.left) / 2;
    const barW = Math.max(2, Math.floor(gap * 0.65));

    ctx.save();
    ohlc.forEach((d, i) => {
      const x = xScale.getPixelForValue(i);
      const pO = yScale.getPixelForValue(d.o);
      const pH = yScale.getPixelForValue(d.h);
      const pL = yScale.getPixelForValue(d.l);
      const pC = yScale.getPixelForValue(d.c);
      const up = d.c >= d.o;
      const col = up ? '#3fb950' : '#f85149';

      // Wick
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, pH);
      ctx.lineTo(x, pL);
      ctx.stroke();

      // Body
      const bTop = Math.min(pO, pC);
      const bH = Math.max(1, Math.abs(pC - pO));
      ctx.lineWidth = 1.2;
      if (up) {
        ctx.strokeStyle = col;
        ctx.strokeRect(x - barW / 2, bTop, barW, bH);
      } else {
        ctx.fillStyle = col;
        ctx.fillRect(x - barW / 2, bTop, barW, bH);
      }
    });
    ctx.restore();
  },
};
Chart.register(_CANDLE_PLUGIN);

// ── Crosshair plugin — draws a vertical guide at the hovered point ────────────

const _CROSSHAIR_PLUGIN = {
  id: 'crosshair',
  afterDraw(chart) {
    const active = chart.getActiveElements?.();
    if (!active || !active.length) return;
    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(139,148,158,0.4)';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  },
};
Chart.register(_CROSSHAIR_PLUGIN);

// ── Chart base options ────────────────────────────────────────────────────────

function _baseOptions(maxTicks) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    hover: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#21262d',
        borderColor: '#30363d',
        borderWidth: 1,
        titleColor: '#e6edf3',
        bodyColor: '#8b949e',
        displayColors: false,
        padding: 10,
        callbacks: { label: (c) => `$${Number(c.parsed.y).toFixed(2)}` },
        filter: (item) => item.parsed.y !== null && item.parsed.y !== undefined && !Number.isNaN(item.parsed.y),
      },
    },
    scales: {
      x: {
        grid: { color: '#1e252d' },
        ticks: { color: '#8b949e', maxTicksLimit: maxTicks, maxRotation: 0, font: { size: 11 } },
      },
      y: {
        position: 'right',
        grid: { color: '#1e252d' },
        ticks: {
          color: '#8b949e',
          font: { size: 11 },
          callback: (v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(2)}`,
        },
      },
    },
  };
}

function _formatLabel(ts, range) {
  const d = new Date(ts * 1000);
  if (range === '1D') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (range === '1W') return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (range === 'ALL') return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Main render function ──────────────────────────────────────────────────────

function renderPriceChart(canvasId, data, range, mode, sentimentScore) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (_priceChart) { _priceChart.destroy(); _priceChart = null; }
  // Remove old forecast info strip
  document.getElementById('chartForecastInfo')?.remove();

  if (!data || data.s !== 'ok' || !data.t?.length) {
    canvas.parentElement.innerHTML =
      '<div class="chart-empty"><div style="font-size:32px">📉</div><p>No price data available for this range</p></div>';
    return;
  }

  const labels  = data.t.map(ts => _formatLabel(ts, range));
  const prices  = data.c;
  const ticks   = { '1D': 8, '1W': 7, '1M': 8, '1Y': 12, 'ALL': 10 }[range] || 8;
  const isUp    = prices[prices.length - 1] >= prices[0];
  const mainCol = isUp ? '#3fb950' : '#f85149';

  if (mode === 'candle') {
    _renderCandle(canvas, data, labels, ticks, range);
  } else if (mode === 'analysis') {
    _renderAnalysis(canvas, data, labels, prices, mainCol, ticks);
  } else if (mode === 'sentiment') {
    _renderSentiment(canvas, data, labels, prices, mainCol, ticks, range, sentimentScore);
  } else {
    _renderLine(canvas, labels, prices, mainCol, ticks);
  }
}

// ── Mode: Line ────────────────────────────────────────────────────────────────

function _renderLine(canvas, labels, prices, color, ticks) {
  const opts = _baseOptions(ticks);
  opts.plugins.tooltip.callbacks.label = (c) => `$${c.parsed.y.toFixed(2)}`;

  _priceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: prices,
        borderColor: color,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.3,
        backgroundColor: (ctx) => {
          const { ctx: c, chartArea } = ctx.chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, color + '28');
          g.addColorStop(1, color + '00');
          return g;
        },
      }],
    },
    options: opts,
  });
}

// ── Mode: Candlestick ─────────────────────────────────────────────────────────

function _renderCandle(canvas, data, labels, ticks, range) {
  // We use a "invisible" line chart as scaffold; our plugin draws the candles
  const opts = _baseOptions(ticks);
  opts.plugins.tooltip.callbacks = {
    title: (items) => labels[items[0].dataIndex] || '',
    label: (c) => {
      const d = data.c[c.dataIndex];
      const o = data.o?.[c.dataIndex] ?? d;
      const h = data.h?.[c.dataIndex] ?? d;
      const l = data.l?.[c.dataIndex] ?? d;
      return [`O: $${o.toFixed(2)}`, `H: $${h.toFixed(2)}`, `L: $${l.toFixed(2)}`, `C: $${d.toFixed(2)}`];
    },
  };

  const ohlc = data.t.map((_, i) => ({
    o: data.o?.[i] ?? data.c[i],
    h: data.h?.[i] ?? data.c[i],
    l: data.l?.[i] ?? data.c[i],
    c: data.c[i],
  }));

  _priceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: data.c,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        pointRadius: 0,
        fill: false,
      }],
    },
    options: opts,
  });
  _priceChart._ohlcData = ohlc;
}

// ── Mode: Technical Analysis ──────────────────────────────────────────────────

function _renderAnalysis(canvas, data, labels, prices, mainCol, ticks) {
  const tech = computeTechnicals(prices);
  const { ema9, ema21, bb, lr, support, resistance, signal } = tech;

  // Extend trend line 5 steps
  const extCount = Math.min(5, Math.floor(prices.length * 0.15) + 1);
  const extLabels = [...labels];
  const trendLine = prices.map((_, i) => lr.slope * i + lr.intercept);
  for (let e = 1; e <= extCount; e++) {
    extLabels.push('→');
    trendLine.push(lr.slope * (prices.length - 1 + e) + lr.intercept);
  }
  const extData = [...prices, ...Array(extCount).fill(null)];

  const opts = _baseOptions(ticks);
  opts.plugins.legend = { display: true, labels: { color: '#8b949e', font: { size: 11 }, boxWidth: 20 } };
  opts.plugins.tooltip.callbacks.label = (c) =>
    c.dataset.label + ': $' + Number(c.parsed.y).toFixed(2);

  // Pad all arrays to match extLabels
  const pad = (arr) => [...arr, ...Array(extCount).fill(null)];

  _priceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: extLabels,
      datasets: [
        { label: 'Price',       data: extData,            borderColor: mainCol,    borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 },
        { label: 'BB Upper',    data: pad(bb.upper),      borderColor: '#6e7681',  borderWidth: 1, pointRadius: 0, fill: false, borderDash: [3,3], tension: 0.2 },
        { label: 'BB Mid',      data: pad(bb.mid),        borderColor: '#6e768155', borderWidth: 1, pointRadius: 0, fill: false, tension: 0.2 },
        { label: 'BB Lower',    data: pad(bb.lower),      borderColor: '#6e7681',  borderWidth: 1, pointRadius: 0, fill: '-2', backgroundColor: '#8b949e0c', tension: 0.2 },
        { label: 'EMA 9',       data: pad(ema9),          borderColor: '#f5a623',  borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.2 },
        { label: 'EMA 21',      data: pad(ema21),         borderColor: '#a371f7',  borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.2 },
        { label: 'Trend',       data: trendLine,          borderColor: '#58a6ff60', borderWidth: 1.5, pointRadius: 0, fill: false, borderDash: [5,3], tension: 0 },
        { label: 'Support',     data: Array(extLabels.length).fill(support),     borderColor: '#3fb95055', borderWidth: 1, pointRadius: 0, fill: false, borderDash: [4,4] },
        { label: 'Resistance',  data: Array(extLabels.length).fill(resistance),  borderColor: '#f8514955', borderWidth: 1, pointRadius: 0, fill: false, borderDash: [4,4] },
      ],
    },
    options: opts,
  });

  // Signal strip below chart
  if (signal) {
    const strip = document.createElement('div');
    strip.id = 'chartForecastInfo';
    strip.className = 'chart-info-strip';
    strip.innerHTML = `<span class="cfi-label">Technical Signal</span><span class="cfi-val">${signal}</span>
      <span class="cfi-label" style="margin-left:12px">Support</span><span class="cfi-val">$${support.toFixed(2)}</span>
      <span class="cfi-label" style="margin-left:12px">Resistance</span><span class="cfi-val">$${resistance.toFixed(2)}</span>`;
    canvas.parentElement.parentElement.insertAdjacentElement('afterend', strip);
  }
}

// ── Mode: Sentiment Forecast ──────────────────────────────────────────────────

function _renderSentiment(canvas, data, labels, prices, mainCol, ticks, range, sentScore) {
  const fc = _sentimentForecast(data, sentScore, range);
  const { pts, direction, totalPct } = fc;

  const fcLabels    = pts.map((p, i) => `+${i + 1}`);
  const allLabels   = [...labels, ...fcLabels];
  const pricePad    = [...prices, ...Array(pts.length).fill(null)];
  const expected    = [...Array(prices.length).fill(null), ...pts.map(p => p.expected)];
  const upper       = [...Array(prices.length).fill(null), ...pts.map(p => p.upper)];
  const lower       = [...Array(prices.length).fill(null), ...pts.map(p => p.lower)];

  // Bridge the gap between last historical price and forecast
  const bridgeIdx   = prices.length - 1;
  expected[bridgeIdx] = prices[prices.length - 1];
  upper[bridgeIdx]    = prices[prices.length - 1];
  lower[bridgeIdx]    = prices[prices.length - 1];

  const fcColor = direction === 'bullish' ? '#3fb950' : '#f85149';

  const opts = _baseOptions(ticks);
  opts.plugins.legend = { display: false };
  opts.plugins.tooltip.callbacks.label = (c) => {
    const n = Number(c.parsed.y);
    return isNaN(n) ? '' : `${c.dataset.label}: $${n.toFixed(2)}`;
  };

  _priceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        { label: 'Price',    data: pricePad, borderColor: mainCol,         borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.3 },
        { label: 'Upper',    data: upper,    borderColor: fcColor + '50',  borderWidth: 1, pointRadius: 0, fill: false, borderDash: [4, 3], tension: 0.3 },
        { label: 'Lower',    data: lower,    borderColor: fcColor + '50',  borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: fcColor + '12', borderDash: [4, 3], tension: 0.3 },
        { label: 'Expected', data: expected, borderColor: fcColor,         borderWidth: 2, pointRadius: 3, fill: false, borderDash: [6, 3], tension: 0.3,
          pointBackgroundColor: fcColor, pointBorderColor: fcColor },
      ],
    },
    options: opts,
  });

  // Forecast info strip
  const pct = totalPct.toFixed(2);
  const arrow = direction === 'bullish' ? '▲' : '▼';
  const strip = document.createElement('div');
  strip.id = 'chartForecastInfo';
  strip.className = 'chart-info-strip';
  strip.style.borderColor = fcColor + '40';
  strip.innerHTML = `
    <span class="cfi-dir" style="color:${fcColor}">${arrow} ${direction.charAt(0).toUpperCase() + direction.slice(1)}</span>
    <span class="cfi-label" style="margin-left:12px">Expected move</span>
    <span class="cfi-val" style="color:${fcColor}">${pct >= 0 ? '+' : ''}${pct}%</span>
    <span class="cfi-label" style="margin-left:12px">Daily drift</span>
    <span class="cfi-val">${(fc.dailyDrift * 100).toFixed(3)}%</span>
    <span class="cfi-label" style="margin-left:12px">Volatility</span>
    <span class="cfi-val">${(fc.vol * 100).toFixed(2)}%</span>
    <span class="cfi-note">Based on compiled sentiment · Not financial advice</span>`;
  canvas.parentElement.parentElement.insertAdjacentElement('afterend', strip);
}

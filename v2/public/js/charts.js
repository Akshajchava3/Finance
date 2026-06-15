let _priceChart = null;

function renderPriceChart(canvasId, data, range) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (_priceChart) { _priceChart.destroy(); _priceChart = null; }

  if (!data || data.s !== 'ok' || !data.t || !data.t.length) {
    canvas.parentElement.innerHTML =
      '<div class="err"><div class="err-icon">📉</div><p>No price history available</p></div>';
    return;
  }

  const labels = data.t.map((ts) => {
    const d = new Date(ts * 1000);
    if (range === '1W') {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const prices = data.c;
  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? '#3fb950' : '#f85149';

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
          const chart = ctx.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, color + '30');
          g.addColorStop(1, color + '00');
          return g;
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#21262d',
          borderColor: '#30363d',
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
          displayColors: false,
          callbacks: { label: (c) => `$${c.parsed.y.toFixed(2)}` },
        },
      },
      scales: {
        x: {
          grid: { color: '#21262d' },
          ticks: { color: '#8b949e', maxTicksLimit: 8, font: { size: 11 } },
        },
        y: {
          position: 'right',
          grid: { color: '#21262d' },
          ticks: {
            color: '#8b949e',
            font: { size: 11 },
            callback: (v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`,
          },
        },
      },
    },
  });
}

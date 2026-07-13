/* =========================================================
   charts.js — all Chart.js visualisations.
   Required charts:
     • Temperature Trend        • Current Trend
     • RPM Trend                • Power Factor Trend
     • Fleet Health Doughnut    • Maintenance Priority Bar
   Plus a per-machine Health Gauge (semicircle doughnut).
   All charts read live from STATE and are re-rendered by the
   simulation / demo-control loops, so they update in real time.
   ========================================================= */

const Charts = (function () {
  const registry = {};           // id -> Chart instance
  const COLORS = THEME;

  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = COLORS.textDim;
    Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
    Chart.defaults.borderColor = COLORS.borderSoft;
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
  }

  /* ---- Data builders ---------------------------------------- */

  /** Average a parameter across active machines over the last n visits. */
  function fleetTrendSeries(key, n) {
    const active = STATE.machines.filter(m => m.status === 'active');
    const perMachine = active.map(m => {
      const rows = machineReadings(m.id).filter(r => r.key === key).sort((a, b) => a.recordedAt - b.recordedAt);
      return rows.slice(-n);
    });
    const len = Math.min(...perMachine.map(a => a.length));
    const labels = [], values = [];
    for (let i = 0; i < len; i++) {
      const vals = perMachine.map(arr => arr[arr.length - len + i].value).filter(v => v != null);
      if (!vals.length) continue;
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      labels.push('');
      values.push(round(avg, key === 'power_factor' ? 2 : 1));
    }
    return { labels, values };
  }

  /** Per-machine time series for a parameter. */
  function machineTrendSeries(machineId, key, n) {
    const rows = machineReadings(machineId).filter(r => r.key === key).sort((a, b) => a.recordedAt - b.recordedAt).slice(-n);
    return {
      labels: rows.map(() => ''),
      values: rows.map(r => r.value),
    };
  }

  /** Count machines by maintenance status for the doughnut. */
  function fleetHealthDistribution() {
    const counts = { healthy: 0, watch: 0, needs_maintenance: 0, insufficient_data: 0 };
    STATE.machines.forEach(m => {
      const rec = getMaintenanceRecommendation(m.id);
      counts[rec.status] = (counts[rec.status] || 0) + 1;
    });
    return counts;
  }

  /** Per-machine maintenance priority, sorted descending. */
  function priorityData() {
    return STATE.machines
      .map(m => ({ name: m.name, priority: getMaintenancePriorityScore(m.id) }))
      .sort((a, b) => b.priority - a.priority);
  }

  /* ---- Factory helpers -------------------------------------- */

  function lineChart(id, label, color, fill) {
    const ctx = document.getElementById(id);
    if (!ctx) return null;
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label, data: [],
          borderColor: color, backgroundColor: fill ? hexA(color, 0.12) : 'transparent',
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4,
          tension: 0.35, fill: !!fill,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { display: false } },
          y: { grid: { color: COLORS.borderSoft }, ticks: { maxTicksLimit: 4 } },
        },
      },
    });
    registry[id] = chart;
    return chart;
  }

  function doughnutChart(id, data) {
    const ctx = document.getElementById(id);
    if (!ctx) return null;
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Healthy', 'Watch', 'Maintenance'],
        datasets: [{
          data: [data.healthy, data.watch, data.needs_maintenance],
          backgroundColor: [COLORS.green, COLORS.amber, COLORS.red],
          borderColor: COLORS.panel, borderWidth: 3, hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: { legend: { position: 'bottom' } },
      },
    });
    registry[id] = chart;
    return chart;
  }

  function barChart(id) {
    const ctx = document.getElementById(id);
    if (!ctx) return null;
    const chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Priority', data: [], backgroundColor: [], borderRadius: 6, maxBarThickness: 38 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: COLORS.borderSoft }, beginAtZero: true },
        },
      },
    });
    registry[id] = chart;
    return chart;
  }

  function gaugeChart(id, value) {
    const ctx = document.getElementById(id);
    if (!ctx) return null;
    const color = value >= 70 ? COLORS.green : value >= 50 ? COLORS.amber : COLORS.red;
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Health', 'Remaining'],
        datasets: [{
          data: [value, 100 - value],
          backgroundColor: [color, COLORS.border],
          borderColor: COLORS.panel, borderWidth: 2, borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '74%',
        rotation: 270, circumference: 180,
        plugins: {
          legend: { display: false }, tooltip: { enabled: false },
          title: { display: true, position: 'bottom', color, font: { size: 22, weight: '600' }, text: value },
        },
      },
    });
    registry[id] = chart;
    return chart;
  }

  /** Convert a hex colour to rgba with given alpha. */
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ---- Public init / update --------------------------------- */

  function initDashboard() {
    lineChart('chartTemp', 'Bearing temp (°C)', COLORS.amber, true);
    lineChart('chartCurrent', 'Output current (A)', COLORS.cyan, true);
    lineChart('chartRpm', 'Speed (rpm)', COLORS.green, true);
    lineChart('chartPf', 'Power factor', COLORS.textDim, false);
    if (!registry['chartHealth']) doughnutChart('chartHealth', fleetHealthDistribution());
    if (!registry['chartPriority']) barChart('chartPriority');
    updateDashboard();
  }

  function updateDashboard() {
    setLine('chartTemp', fleetTrendSeries('bearing_temp', 24), '°C');
    setLine('chartCurrent', fleetTrendSeries('output_current', 24), 'A');
    setLine('chartRpm', fleetTrendSeries('speed_rpm', 24), 'rpm');
    setLine('chartPf', fleetTrendSeries('power_factor', 24), '');
    if (registry['chartHealth']) {
      const d = fleetHealthDistribution();
      registry['chartHealth'].data.datasets[0].data = [d.healthy, d.watch, d.needs_maintenance];
      registry['chartHealth'].update();
    }
    if (registry['chartPriority']) {
      const p = priorityData();
      registry['chartPriority'].data.labels = p.map(x => x.name);
      registry['chartPriority'].data.datasets[0].data = p.map(x => x.priority);
      registry['chartPriority'].data.datasets[0].backgroundColor = p.map(x =>
        x.priority >= 60 ? COLORS.red : x.priority >= 40 ? COLORS.amber : COLORS.green);
      registry['chartPriority'].update();
    }
  }

  function initDetail(machineId) {
    lineChart('dChartTemp', 'Bearing temp (°C)', COLORS.amber, true);
    lineChart('dChartCurrent', 'Output current (A)', COLORS.cyan, true);
    lineChart('dChartRpm', 'Speed (rpm)', COLORS.green, true);
    lineChart('dChartPf', 'Power factor', COLORS.textDim, false);
    if (!registry['dChartGauge']) gaugeChart('dChartGauge', getHealthIndex(machineId) || 0);
    updateDetail(machineId);
  }

  function updateDetail(machineId) {
    setLine('dChartTemp', machineTrendSeries(machineId, 'bearing_temp', 24), '°C');
    setLine('dChartCurrent', machineTrendSeries(machineId, 'output_current', 24), 'A');
    setLine('dChartRpm', machineTrendSeries(machineId, 'speed_rpm', 24), 'rpm');
    setLine('dChartPf', machineTrendSeries(machineId, 'power_factor', 24), '');
    const g = registry['dChartGauge'];
    if (g) {
      const v = getHealthIndex(machineId) || 0;
      const color = v >= 70 ? COLORS.green : v >= 50 ? COLORS.amber : COLORS.red;
      g.data.datasets[0].data = [v, 100 - v];
      g.data.datasets[0].backgroundColor = [color, COLORS.border];
      g.options.plugins.title.color = color;
      g.options.plugins.title.text = v;
      g.update();
    }
  }

  function setLine(id, series, unit) {
    const c = registry[id];
    if (!c) return;
    c.data.labels = series.labels;
    c.data.datasets[0].data = series.values;
    c.data.datasets[0].label = c.data.datasets[0].label.split(' (')[0] + (unit ? ` (${unit})` : '');
    c.update();
  }

  return {
    init: function (scope, machineId) { scope === 'detail' ? initDetail(machineId) : initDashboard(); },
    update: function (scope, machineId) { scope === 'detail' ? updateDetail(machineId) : updateDashboard(); },
    refreshAll: function () { updateDashboard(); Object.keys(registry).forEach(k => { if (k.startsWith('dChart')) registry[k].update(); }); },
    registry,
  };
})();

window.App.charts = Charts;

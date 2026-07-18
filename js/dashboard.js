/* =========================================================
   dashboard.js — application shell, rendering & wiring.
   Refactored from the original single-file dashboard: the
   calculations, seed data and CSV logic now live in their own
   modules. This file only handles UI rendering and events.
   Every original screen is preserved:
     entry · dashboard · status · detail · reports
   ========================================================= */

let currentUser = null;
let currentScreen = 'dashboard';
let currentDetailMachine = null;
let dashboardChartsReady = false;
let detailChartsReady = false;
let _prevStatus = {};   // machineId -> status, for transition toasts
let _clockTimer = null;

/* Navigation model. roleTag is shown in the sidebar. */
const NAV = [
  { id: 'entry',     label: 'Log a reading',     roleTag: 'ALL',    roles: ['miner', 'it', 'admin'] },
  { id: 'dashboard', label: 'Fleet analytics',   roleTag: 'ADMIN',  roles: ['it', 'admin'] },
  { id: 'status',    label: 'Generator status',  roleTag: 'ALL',    roles: ['miner', 'it', 'admin'] },
  { id: 'detail',    label: 'Generator detail',  roleTag: 'ADMIN',  roles: ['it', 'admin'] },
  { id: 'reports',   label: 'Export data',       roleTag: 'ADMIN',  roles: ['it', 'admin'] },
];

/* ---------------------------------------------------------
   INIT
   --------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', init);

function init() {
  currentUser = Auth.requireAuth();          // redirects to login if missing
  if (!currentUser) return;

  // Greet + seed activity + start simulation.
  pushActivity({ type: 'login', text: `${currentUser.name} signed in as ${currentUser.role}` });
  toast(`Welcome back, ${currentUser.name}`, 'success');

  buildTopbar();
  wireEvents();
  currentScreen = Auth.landingFor(currentUser.role);
  if (currentScreen === 'detail') currentDetailMachine = STATE.machines[0].id;

  renderAll();

  if (loadSettings().simulationOn) Simulation.start();
  startClock();
}

/* ---------------------------------------------------------
   TOPBAR / HEADER
   --------------------------------------------------------- */
function buildTopbar() {
  const chip = document.getElementById('userChip');
  if (chip) {
    chip.innerHTML = `
      <span class="user-avatar">${escapeHtml((currentUser.name || '?').charAt(0))}</span>
      <span class="user-meta">
        <span class="user-name">${escapeHtml(currentUser.name)}</span>
        <span class="user-role">${escapeHtml(currentUser.role.toUpperCase())}</span>
      </span>`;
  }
  const demoWrap = document.getElementById('demoControls');
  if (demoWrap) demoWrap.style.display = (currentUser.role === 'admin') ? 'flex' : 'none';
}

function startClock() {
  const el = document.getElementById('liveClock');
  const sync = document.getElementById('lastSync');
  const s = loadSettings();
  if (sync) sync.textContent = 'Last sync ' + clockTime(s.lastSync);
  const tick = () => { if (el) el.textContent = clockTime(new Date()); };
  tick();
  _clockTimer = setInterval(tick, 1000);
}

/* ---------------------------------------------------------
   EVENT WIRING
   --------------------------------------------------------- */
function wireEvents() {
  const logout = document.getElementById('logoutBtn');
  if (logout) logout.addEventListener('click', () => Auth.logout());

  const bell = document.getElementById('bellBtn');
  if (bell) bell.addEventListener('click', () => Notifications.toggle());

  // Demo control buttons (admin only).
  $all('[data-demo]').forEach(btn => {
    btn.addEventListener('click', () => Demo.applyState(btn.getAttribute('data-demo')));
  });

  // Sidebar reset.
  const reset = document.getElementById('resetBtn');
  if (reset) reset.addEventListener('click', () => {
    if (confirm('Reset all demo data back to the seeded starting point?')) {
      resetDemo();
      toast('Demo data reset', 'info');
      pushActivity({ type: 'system', text: 'Demo data reset to seeded state' });
      refreshAll();
    }
  });

  // Theme toggle....
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    const saved = localStorage.getItem('geomine_theme') || 'dark';
    if (saved === 'light') document.body.setAttribute('data-theme', 'light');
    updateThemeIcon(saved);
    themeBtn.addEventListener('click', () => {
      const current = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.body.setAttribute('data-theme', current === 'light' ? 'light' : '');
      localStorage.setItem('geomine_theme', current);
      updateThemeIcon(current);
    });
  }

  // Print report....
  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  // Keyboard shortcuts.
  document.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;
    const key = ev.key.toLowerCase();
    if (key === '1') showScreen('dashboard');
    if (key === '2') showScreen('entry');
    if (key === '3') showScreen('status');
    if (key === '4') showScreen('detail');
    if (key === '5') showScreen('reports');
    if (key === 't') { themeBtn?.click(); }
    if (key === 'escape') showScreen('dashboard');
  });

  // Global hooks used by other modules.
  window.App.onSimTick = handleSimTick;
  window.App.refreshAll = refreshAll;
  window.App.onActivity = () => { Demo.renderActivity('activityFeed'); };
}

/* ---------------------------------------------------------
   NAVIGATION
   --------------------------------------------------------- */
function renderNav() {
  const nav = document.getElementById('navItems');
  if (!nav) return;
  const role = currentUser.role;
  nav.innerHTML = NAV.map(item => {
    const allowed = item.roles.includes(role);
    const active = item.id === currentScreen;
    return `<div class="nav-item ${active ? 'active' : ''} ${allowed ? '' : 'disabled'}" data-nav="${allowed ? item.id : ''}">
      <span class="nav-label">${item.label}</span><span class="nav-role">${item.roleTag}</span>
    </div>`;
  }).join('');
  $all('#navItems .nav-item').forEach(el => {
    if (el.classList.contains('disabled')) return;
    el.addEventListener('click', () => showScreen(el.getAttribute('data-nav')));
  });
}

function showScreen(id) {
  currentScreen = id;
  if (id === 'detail' && !currentDetailMachine) currentDetailMachine = STATE.machines[0].id;
  renderAll();
}

function openMachine(id) {
  currentDetailMachine = id;
  showScreen('detail');
}

function renderAll() {
  renderNav();
  $all('.screen').forEach(s => s.classList.remove('active'));
  const scr = document.getElementById('screen-' + currentScreen);
  if (scr) scr.classList.add('active');

  if (currentScreen === 'entry') renderEntry();
  if (currentScreen === 'dashboard') renderDashboard();
  if (currentScreen === 'status') renderStatus();
  if (currentScreen === 'detail') renderDetail();
  if (currentScreen === 'reports') renderReports();

  const titles = { entry: 'Log a Reading', dashboard: 'Fleet Analytics', status: 'Generator Status', detail: 'Generator Detail', reports: 'Export Data' };
  const t = document.getElementById('pageTitle');
  if (t) t.textContent = titles[currentScreen] || '';
}

/* ---------------------------------------------------------
   ENTRY SCREEN (miner data entry)
   --------------------------------------------------------- */
function renderEntry() {
  const sel = document.getElementById('entryMachine');
  if (sel) sel.innerHTML = STATE.machines.filter(m => m.status === 'active')
    .map(m => `<option value="${m.id}">${m.name} — ${m.location}</option>`).join('');

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const timeEl = document.getElementById('entryTime');
  if (timeEl) timeEl.value = now.toISOString().slice(0, 16);

  const paramsDiv = document.getElementById('entryParams');
  if (paramsDiv) {
    paramsDiv.innerHTML = '<div class="param-grid">' + PARAM_DEFS.map(p =>
      `<div class="field"><label>${p.label}${p.unit ? ` <span class="unit">(${p.unit})</span>` : ''}</label>
       <input type="number" step="any" id="entry_${p.key}" placeholder="—" /></div>`
    ).join('') + '</div>';
  }

  const mine = STATE.readings
    .filter(r => currentUser.role === 'miner' ? r.enteredBy === currentUser.id : true)
    .sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 8);
  const hist = document.getElementById('myHistory');
  if (hist) {
    hist.innerHTML = mine.length ? mine.map(r => {
      const m = machineById(r.machineId), p = paramDef(r.key);
      return `<div class="list-row">${m.name} — ${p.label}: ${r.value}${p.unit} ${r.flagged ? '<span style="color:var(--red)">⚑</span>' : ''}<span class="ts">${new Date(r.recordedAt).toLocaleString()}</span></div>`;
    }).join('') : '<div class="empty-note">No entries yet.</div>';
  }
}

function submitReading() {
  const machineId = document.getElementById('entryMachine').value;
  const recordedAt = new Date(document.getElementById('entryTime').value).getTime();
  if (recordedAt > Date.now() + 3600000) { toast('Reading time cannot be in the future', 'warning'); return; }

  let count = 0;
  PARAM_DEFS.forEach(p => {
    const input = document.getElementById('entry_' + p.key);
    const val = parseFloat(input.value);
    if (isNaN(val)) return;
    const flagged = (p.max !== undefined && val > p.max) || (p.min !== undefined && val < p.min);
    STATE.readings.push({ id: STATE.nextReadingId++, machineId, key: p.key, value: val, recordedAt, enteredBy: currentUser.id, flagged: !!flagged });
    count++;
  });

  if (count === 0) { toast('Enter at least one value', 'warning'); return; }
  saveState();
  markSync();
  toast(`Reading logged for ${machineById(machineId).name}`, 'success');
  pushActivity({ type: 'submit', text: `${currentUser.name} submitted a reading for ${machineById(machineId).name}`, meta: { machineId } });
  renderEntry();
}

/* ---------------------------------------------------------
   DASHBOARD SCREEN (admin analytics)
   --------------------------------------------------------- */
/** Compute the six headline KPI values for the admin dashboard. */
function computeKpis() {
  const machines = STATE.machines;
  const active = machines.filter(m => m.status === 'active').length;
  const flagged30d = STATE.readings.filter(r => r.flagged && r.recordedAt >= Date.now() - 30 * 86400000);
  const healths = machines.map(m => getHealthIndex(m.id)).filter(v => v != null);
  const avgHealth = healths.length ? round(healths.reduce((s, v) => s + v, 0) / healths.length, 1) : '—';
  const critical = machines.filter(m => getMaintenanceRecommendation(m.id).status === 'needs_maintenance').length;
  return [
    { label: 'Generators', value: machines.length, tone: '' },
    { label: 'Online', value: active, tone: 'green' },
    { label: 'Readings', value: STATE.readings.length, tone: '' },
    { label: 'Flagged (30d)', value: flagged30d.length, tone: flagged30d.length ? 'amber' : 'green' },
    { label: 'Avg Health', value: avgHealth, tone: avgHealth >= 70 ? 'green' : avgHealth >= 50 ? 'amber' : 'red' },
    { label: 'Critical', value: critical, tone: critical ? 'red' : 'green' },
  ];
}

function renderKpis() {
  const kpis = computeKpis();
  const statGrid = document.getElementById('statGrid');
  if (!statGrid) return;
  statGrid.innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.tone ? 'kpi-' + k.tone : ''}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value mono" data-target="${k.value}">0</div>
      <div class="kpi-spark"></div>
      <canvas class="kpi-sparkline" width="160" height="36"></canvas>
    </div>`).join('');
  statGrid.querySelectorAll('.kpi-value').forEach(el => animateCounter(el, parseFloat(el.dataset.target)));
  renderSparklines();
}

/** Lightweight live refresh (called on every simulation tick). */
function liveRefreshDashboard() {
  const kpis = computeKpis();
  const vals = document.querySelectorAll('#statGrid .kpi-value');
  kpis.forEach((k, i) => { const el = vals[i]; if (el) { el.dataset.target = k.value; animateCounter(el, parseFloat(k.value)); } });
  renderFleetList('fleetList');
  renderFlagged('flaggedSection');
  renderRecent('recentList');
  Charts.update('dashboard');
  Demo.renderInsights('aiInsights');
  renderSparklines();
}

function renderDashboard() {
  const machines = STATE.machines;
  const active = machines.filter(m => m.status === 'active').length;
  document.getElementById('fleetSub').textContent = `${machines.length} generators · ${active} online · across 2 sites`;

  renderKpis();
  renderFleetList('fleetList');
  renderFlagged('flaggedSection');
  renderRecent('recentList');

  if (!dashboardChartsReady) { Charts.init('dashboard'); dashboardChartsReady = true; }
  else Charts.update('dashboard');

  Demo.renderInsights('aiInsights');
  Demo.renderActivity('activityFeed');
}

/* Fleet list sorted by maintenance priority (preserved behaviour). */
function renderFleetList(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const ranked = STATE.machines.map(m => ({ m, priority: getMaintenancePriorityScore(m.id) })).sort((a, b) => b.priority - a.priority);
  el.innerHTML = ranked.map(({ m }) => {
    const last = machineReadings(m.id).sort((a, b) => b.recordedAt - a.recordedAt)[0];
    const dot = statusDot(m.id);
    return `<div class="fleet-row" data-open="${m.id}">
      <div class="fleet-id">
        <span class="dot ${dot}"></span>
        <div><div class="fleet-name">${m.name}</div>
        <div class="fleet-sub">${m.location} — ${last ? new Date(last.recordedAt).toLocaleDateString() : 'no readings'}</div></div>
      </div>
      <div class="fleet-metrics">
        <div class="fleet-metric"><div class="fleet-metric-label">LOADING</div><div class="fleet-metric-value">${fmt(getLoadingPct(m.id), '%')}</div></div>
        <div class="fleet-metric"><div class="fleet-metric-label">HEALTH</div><div class="fleet-metric-value">${fmt(getHealthIndex(m.id))}</div></div>
        <div class="fleet-metric"><div class="fleet-metric-label">PRIORITY</div><div class="fleet-metric-value">${fmt(getMaintenancePriorityScore(m.id))}</div></div>
      </div></div>`;
  }).join('');
  $all('#' + elId + ' .fleet-row').forEach(r => {
    if (currentUser.role === 'miner') return; // miners use the read-only status screen
    r.addEventListener('click', () => openMachine(r.getAttribute('data-open')));
  });
}

function renderFlagged(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const flagged = STATE.readings.filter(r => r.flagged).sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 6);
  const flaggedWrap = document.getElementById('flaggedSection');
  if (!flagged.length) { flaggedWrap.innerHTML = ''; return; }
  flaggedWrap.innerHTML = `
    <div class="group-label" style="color:var(--red);">Out-of-range readings</div>
    <div class="card tint-red">${flagged.map(r => {
      const m = machineById(r.machineId), p = paramDef(r.key);
      return `<div class="list-row"><span class="machine-link" data-mid="${m.id}">${m.name}</span> — ${p.label}: ${r.value}${p.unit} <span class="ts">${new Date(r.recordedAt).toLocaleString()}</span></div>`;
    }).join('')}</div>`;
  $all('#flaggedSection .machine-link').forEach(el => {
    el.style.cursor = 'pointer';
    el.style.color = 'var(--red)';
    el.style.textDecoration = 'underline';
    el.addEventListener('click', () => openMachine(el.getAttribute('data-mid')));
  });
}

function renderRecent(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const recent = [...STATE.readings].sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 6);
  const recentEl = document.getElementById('recentList');
  recentEl.innerHTML = recent.map(r => {
    const m = machineById(r.machineId), p = paramDef(r.key);
    return `<div class="list-row"><span class="machine-link" data-mid="${m.id}">${m.name}</span> — ${p.label}: ${r.value}${p.unit}<span class="ts">${new Date(r.recordedAt).toLocaleString()}</span></div>`;
  }).join('');
  $all('#recentList .machine-link').forEach(el => {
    el.style.cursor = 'pointer';
    el.style.color = 'var(--cyan)';
    el.style.textDecoration = 'underline';
    el.addEventListener('click', () => openMachine(el.getAttribute('data-mid')));
  });
}

/* ---------------------------------------------------------
   STATUS SCREEN (miner read-only overview)
   --------------------------------------------------------- */
function renderStatus() {
  const el = document.getElementById('statusGrid');
  if (!el) return;
  el.innerHTML = STATE.machines.map(m => {
    const rec = getMaintenanceRecommendation(m.id);
    const health = getHealthIndex(m.id);
    const tone = rec.status === 'needs_maintenance' ? 'red' : rec.status === 'watch' ? 'amber' : 'green';
    return `<div class="gen-card gen-${tone}" data-mid="${m.id}" style="cursor:pointer">
      <div class="gen-head"><span class="dot ${statusDot(m.id)}"></span><span class="gen-name">${m.name}</span>
        <span class="gen-badge badge-${tone}">${rec.status.replace('_', ' ')}</span></div>
      <div class="gen-loc">${m.location}</div>
      <div class="gen-metrics">
        <div><span class="gm-label">HEALTH</span><span class="gm-val">${fmt(health)}</span></div>
        <div><span class="gm-label">LOAD</span><span class="gm-val">${fmt(getLoadingPct(m.id), '%')}</span></div>
        <div><span class="gm-label">PRIORITY</span><span class="gm-val">${fmt(getMaintenancePriorityScore(m.id))}</span></div>
      </div>
      <div class="gen-bar"><div class="gen-bar-fill" style="width:${Math.max(0, Math.min(100, health || 0))}%; background:${statusColor(rec.status)}"></div></div>
    </div>`;
  }).join('');
  $all('#statusGrid .gen-card').forEach(card => {
    card.addEventListener('click', () => openMachine(card.getAttribute('data-mid')));
  });

  const hist = document.getElementById('statusHistory');
  if (hist) {
    const mine = STATE.readings.filter(r => r.enteredBy === currentUser.id).sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 10);
    hist.innerHTML = mine.length ? mine.map(r => {
      const m = machineById(r.machineId), p = paramDef(r.key);
      return `<div class="list-row">${m.name} — ${p.label}: ${r.value}${p.unit}<span class="ts">${new Date(r.recordedAt).toLocaleString()}</span></div>`;
    }).join('') : '<div class="empty-note">You have not logged any readings yet.</div>';
  }
}

/* ---------------------------------------------------------
   DETAIL SCREEN (generator detail + charts)
   --------------------------------------------------------- */
function renderDetail() {
  const m = machineById(currentDetailMachine);
  document.getElementById('detailName').textContent = m.name;
  document.getElementById('detailLocation').textContent = m.location;

  const rec = getMaintenanceRecommendation(m.id);
  const statusLabel = { healthy: 'Healthy', watch: 'Watch', needs_maintenance: 'Maintenance recommended', insufficient_data: 'Not enough data yet' }[rec.status];
  document.getElementById('detailRecommendation').innerHTML = `
    <div class="rec-card ${rec.status}">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="rec-status ${rec.status}">${statusLabel}</span>
        <span class="rec-meta">CONFIDENCE: ${rec.confidence.toUpperCase()} · ${rec.sampleCount} VISITS${rec.avgIntervalHours ? ` · ~${Math.round(rec.avgIntervalHours)}H APART` : ''}</span>
      </div>
      <ul class="rec-reasons">${rec.reasons.map(r => `<li>${r}</li>`).join('')}</ul>
      <div class="rec-disclaimer">Rule-based triage guidance from recent readings — not a diagnosis. Verify against the reasons above before acting.</div>
    </div>`;

  const openFaults = STATE.faults.filter(f => f.machineId === m.id && !f.resolved);
  document.getElementById('detailFaults').innerHTML = openFaults.length ? `
    <div class="card tint-red" style="margin-bottom:20px;">
      <div style="font-weight:600; font-size:12.5px;">${openFaults.length} open fault${openFaults.length > 1 ? 's' : ''}</div>
      ${openFaults.map(f => `<div style="font-size:12px; color:var(--text-dim); margin-top:2px;">${f.code} — ${f.description} <span class="ts">${new Date(f.recordedAt).toLocaleDateString()}</span></div>`).join('')}
    </div>` : '';

  document.getElementById('detailLatest').innerHTML = `
    <div class="metric-tile"><div class="metric-label">Fuel level</div><div class="metric-value">${fmt(latestValue(m.id, 'fuel_level'), ' L')}</div></div>
    <div class="metric-tile"><div class="metric-label">Engine hours</div><div class="metric-value">${fmt(latestValue(m.id, 'engine_hours'), ' hr')}</div></div>
    <div class="metric-tile"><div class="metric-label">Coolant temp</div><div class="metric-value">${fmt(latestValue(m.id, 'coolant_temp'), '°C')}</div></div>
    <div class="metric-tile"><div class="metric-label">Open faults</div><div class="metric-value">${openFaults.length}</div></div>`;

  const fuelMetric = getSpecificFuelConsumption(m.id);
  document.getElementById('detailPhysics').innerHTML = `
    <div class="metric-tile"><div class="metric-label">Loading</div><div class="metric-value" style="color:var(--cyan)">${fmt(getLoadingPct(m.id), '%')}</div></div>
    <div class="metric-tile"><div class="metric-label">Apparent power</div><div class="metric-value" style="color:var(--cyan)">${fmt(getApparentPowerKva(m.id), ' kVA')}</div></div>
    <div class="metric-tile"><div class="metric-label">Real power</div><div class="metric-value" style="color:var(--cyan)">${fmt(getRealPowerKw(m.id), ' kW')}</div></div>
    <div class="metric-tile"><div class="metric-label">Frequency</div><div class="metric-value" style="color:var(--cyan)">${fmt(getFrequencyHz(m.id), ' Hz')}</div></div>
    <div class="metric-tile"><div class="metric-label">Fuel efficiency</div><div class="metric-value">${fuelMetric.lPerKwh !== null ? fuelMetric.lPerKwh + ' L/kWh' : '—'}</div></div>`;

  const overload = getOverloadIdleMinutes(m.id, 'overload'), idle = getOverloadIdleMinutes(m.id, 'idle'), pfTrend = getPowerFactorTrend(m.id);
  document.getElementById('detailHeuristic').innerHTML = `
    <div class="metric-tile"><div class="metric-label">Thermal stress</div><div class="metric-value" style="color:var(--amber)">${fmt(getThermalStressIndex(m.id), '%')}</div></div>
    <div class="metric-tile"><div class="metric-label">Health index</div><div class="metric-value" style="color:var(--amber)">${fmt(getHealthIndex(m.id))}</div></div>
    <div class="metric-tile"><div class="metric-label">Maintenance priority</div><div class="metric-value" style="color:var(--amber)">${fmt(getMaintenancePriorityScore(m.id))}</div></div>
    <div class="metric-tile"><div class="metric-label">Overload (30d)</div><div class="metric-value">${overload.minutes} min</div><div class="metric-hint">${overload.sampleCount} samples</div></div>
    <div class="metric-tile"><div class="metric-label">Idle (30d)</div><div class="metric-value">${idle.minutes} min</div><div class="metric-hint">${idle.sampleCount} samples</div></div>
    <div class="metric-tile"><div class="metric-label">PF trend</div><div class="metric-value" style="font-size:13px;">${pfTrend.direction.replace('_', ' ')}</div><div class="metric-hint">${pfTrend.sampleCount} samples</div></div>`;

  if (!detailChartsReady) { Charts.init('detail', m.id); detailChartsReady = true; }
  else Charts.update('detail', m.id);
}

/* ---------------------------------------------------------
   REPORTS SCREEN
   --------------------------------------------------------- */
function renderReports() {
  const sel = document.getElementById('reportMachine');
  if (sel) sel.innerHTML = '<option value="all">All generators</option>' + STATE.machines.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  const to = new Date(), from = new Date(Date.now() - 30 * 86400000);
  const fromEl = document.getElementById('reportFrom'), toEl = document.getElementById('reportTo');
  if (fromEl) fromEl.value = from.toISOString().slice(0, 10);
  if (toEl) toEl.value = to.toISOString().slice(0, 10);
}

/* ---------------------------------------------------------
   ANIMATED COUNTER
   --------------------------------------------------------- */
function animateCounter(el, target) {
  if (isNaN(target)) { el.textContent = target; return; }
  const startVal = parseFloat(el.textContent) || 0;
  const dur = 700, t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const v = startVal + (target - startVal) * eased;
    el.textContent = (Number.isInteger(target)) ? Math.round(v) : round(v, 1);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ---------------------------------------------------------
   SIMULATION TICK → refresh + contextual notifications
   --------------------------------------------------------- */
function handleSimTick() {
  STATE.machines.forEach(m => {
    const status = getMaintenanceRecommendation(m.id).status;
    const prev = _prevStatus[m.id];
    if (prev && prev !== status) {
      if (status === 'needs_maintenance') toast(`${m.name}: maintenance recommended`, 'error');
      else if (status === 'watch' && prev === 'healthy') toast(`${m.name}: entering watch state`, 'warning');
      else if (status === 'healthy' && prev !== 'healthy') toast(`${m.name}: healthy again`, 'success');
    }
    _prevStatus[m.id] = status;
  });

  if (currentScreen === 'dashboard') liveRefreshDashboard();
  if (currentScreen === 'detail') Charts.update('detail', currentDetailMachine);
  if (currentScreen === 'status') renderStatus();
  // NOTE: the entry screen is intentionally NOT refreshed here so a
  // miner's in-progress form is never wiped by the simulation.
}

/* ---------------------------------------------------------
   GLOBAL REFRESH (used by demo controls)
   --------------------------------------------------------- */
function refreshAll() {
  _prevStatus = {};
  renderAll();
  if (dashboardChartsReady) Charts.update('dashboard');
  if (detailChartsReady && currentDetailMachine) Charts.update('detail', currentDetailMachine);
  const sync = document.getElementById('lastSync');
  if (sync) sync.textContent = 'Last sync ' + clockTime(loadSettings().lastSync);
}

/* Expose to global scope for inline handlers / debugging. */
window.App.dashboard = { showScreen, openMachine, submitReading, downloadCsv, refreshAll };
window.showScreen = showScreen;
window.openMachine = openMachine;
window.submitReading = submitReading;
window.downloadCsv = downloadCsv;
window.generatePdfReport = generatePdfReport;

/* ---------------------------------------------------------
   HELPERS — theme, sparklines, PDF, keyboard hints
   --------------------------------------------------------- */
function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.innerHTML = theme === 'light' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  btn.title = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
}

function sparklineData(target, len) {
  const arr = [];
  for (let i = 0; i < (len || 12); i++) {
    arr.push(target + Math.sin(i * 0.9) * target * 0.18 + (Math.random() - 0.5) * target * 0.12);
  }
  return arr;
}

function renderSparklines() {
  const cards = document.querySelectorAll('#statGrid .kpi-card');
  cards.forEach((card, idx) => {
    const canvas = card.querySelector('.kpi-sparkline');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const data = sparklineData(parseFloat(card.querySelector('.kpi-value')?.dataset.target || 0));
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = card.classList.contains('kpi-red') ? THEME.red : card.classList.contains('kpi-amber') ? THEME.amber : card.classList.contains('kpi-green') ? THEME.green : THEME.cyan;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - 2 - ((v - min) / range) * (h - 6);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function generatePdfReport() {
  if (typeof window.jspdf === 'undefined') { toast('PDF library not loaded', 'warning'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('GeoMine PMS — Fleet Brief', 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Generated: ' + new Date().toLocaleString(), 14, 24);

  doc.setFontSize(13);
  doc.text('Fleet Summary', 14, 34);
  doc.setFontSize(10);
  let y = 42;
  STATE.machines.forEach(m => {
    const health = getHealthIndex(m.id);
    const loading = getLoadingPct(m.id);
    const rec = getMaintenanceRecommendation(m.id);
    const line = `${m.name} | ${m.location} | Health: ${fmt(health)} | Loading: ${fmt(loading,'%')} | Status: ${rec.status.replace(/_/g,' ')}`;
    doc.text(line, 14, y);
    y += 7;
    if (y > 280) { doc.addPage(); y = 20; }
  });

  y += 4;
  doc.setFontSize(13);
  doc.text('AI Insights', 14, y);
  y += 8;
  doc.setFontSize(10);
  Demo.generateInsights().slice(0, 10).forEach(ins => {
    const line = `[${ins.severity.toUpperCase()}] ${ins.machine}: ${ins.title} (${ins.confidence}%)`;
    doc.text(line, 14, y);
    y += 6;
    if (y > 280) { doc.addPage(); y = 20; }
  });

  doc.save('geomine-fleet-brief.pdf');
  toast('PDF brief exported', 'success');
  pushActivity({ type: 'export', text: 'PDF fleet brief exported' });
}

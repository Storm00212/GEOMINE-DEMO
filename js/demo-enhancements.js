/* =========================================================
   demo-enhancements.js — presentation-layer intelligence.
   Three features the source dashboard did not have:
     1. AI Insights panel  (rule-based, no ML)
     2. Activity feed       (timeline of recent events)
     3. Demo Controls       (Healthy / Warning / Critical / Reset)
   None of these alter the original calculations — they only
   read STATE and, for demo controls, nudge the live readings.
   ========================================================= */

const Demo = (function () {

  /* ---- AI Insights (rule-based) ----------------------------- */

  function generateInsights() {
    const insights = [];
    STATE.machines.forEach(m => {
      const temp = latestValue(m.id, 'bearing_temp');
      const cool = latestValue(m.id, 'coolant_temp');
      const curr = latestValue(m.id, 'output_current');
      const oil = latestValue(m.id, 'oil_pressure');
      const pf = latestValue(m.id, 'power_factor');
      const loading = getLoadingPct(m.id);
      const thermal = getThermalStressIndex(m.id);
      const pfTrend = getPowerFactorTrend(m.id);

      if (temp != null && thermal != null && thermal >= 80) {
      insights.push({
        machineId: m.id, machine: m.name, severity: thermal >= 100 ? 'critical' : 'warning',
        title: 'Possible bearing overheating',
        detail: `Bearing/stator temperature at ${temp}°C (thermal stress ${thermal}%). Inspect lubrication and cooling path.`,
        confidence: Math.min(99, 60 + Math.round(thermal / 2)),
      });
      }
      if (loading != null && loading >= 90) {
        insights.push({
        machineId: m.id, machine: m.name, severity: 'warning',
        title: 'High electrical loading',
          detail: `Load at ${loading}% of rated current. Sustained overload risks winding insulation failure.`,
          confidence: Math.min(99, 55 + Math.round((loading - 90) * 3)),
        });
      }
      if (cool != null && cool >= 90) {
        insights.push({
        machineId: m.id, machine: m.name, severity: 'warning',
        title: 'Cooling efficiency decreasing',
          detail: `Coolant at ${cool}°C. Check radiator, fan drive and coolant level.`,
          confidence: Math.min(99, 50 + Math.round((cool - 90) * 4)),
        });
      }
      if (oil != null && oil < 3.2) {
        insights.push({
        machineId: m.id, machine: m.name, severity: oil < 2.8 ? 'critical' : 'warning',
        title: 'Lubrication inspection recommended',
          detail: `Oil pressure low at ${oil} bar. Verify oil pump health and sump level.`,
          confidence: Math.min(99, 60 + Math.round((3.2 - oil) * 30)),
        });
      }
      if (pfTrend.direction === 'declining' && pf != null && pf < 0.85) {
        insights.push({
        machineId: m.id, machine: m.name, severity: 'warning',
        title: 'Power factor degrading',
          detail: `PF trending down (now ${pf}). Motors may be lightly loaded or PFC capacitors failing.`,
          confidence: Math.min(99, 55 + pfTrend.sampleCount),
        });
      }
    });

    if (!insights.length) {
      insights.push({
        machine: 'Fleet', severity: 'healthy',
        title: 'All systems nominal',
        detail: 'No rule-based risk indicators triggered across the active fleet.',
        confidence: 92,
      });
    }

    const order = { critical: 0, warning: 1, healthy: 2 };
    insights.sort((a, b) => order[a.severity] - order[b.severity]);
    return insights;
  }

  function renderInsights(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const insights = generateInsights();
    el.innerHTML = insights.map(ins => `
      <div class="insight insight-${ins.severity}">
        <div class="insight-head">
          <span class="insight-icon"><i class="fa-solid ${iconFor(ins.severity)}"></i></span>
          <div class="insight-title">${escapeHtml(ins.title)}</div>
          <div class="insight-conf">${ins.confidence}%</div>
        </div>
        <div class="insight-machine machine-link" data-mid="${ins.machineId || ''}" onclick="openMachine(this.getAttribute('data-mid'))">${escapeHtml(ins.machine)}</div>
        <div class="insight-detail">${escapeHtml(ins.detail)}</div>
        <div class="conf-track"><div class="conf-fill conf-${ins.severity}" style="width:${ins.confidence}%"></div></div>
      </div>`).join('');
  }

  function iconFor(sev) {
    return ({ critical: 'fa-fire', warning: 'fa-triangle-exclamation', healthy: 'fa-shield-halved' })[sev] || 'fa-circle-info';
  }

  /* ---- Activity feed ---------------------------------------- */

  function renderActivity(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const items = loadActivity();
    if (!items.length) {
      el.innerHTML = `<div class="empty-note">No activity recorded yet. Log a reading or run a demo control.</div>`;
      return;
    }
    el.innerHTML = items.slice(0, 25).map(it => `
      <div class="feed-item feed-${it.type}">
        <span class="feed-dot"><i class="fa-solid ${feedIcon(it.type)}"></i></span>
        <div class="feed-body">
          <div class="feed-text">${escapeHtml(it.text)}</div>
          <div class="feed-time">${timeAgo(it.at)}</div>
        </div>
      </div>`).join('');
  }

  function feedIcon(type) {
    return ({
      system: 'fa-arrows-rotate', export: 'fa-file-csv', submit: 'fa-pen-to-square',
      warning: 'fa-triangle-exclamation', healthy: 'fa-circle-check', login: 'fa-right-to-bracket',
      demo: 'fa-sliders', event: 'fa-circle',
    })[type] || 'fa-circle';
  }

  /* ---- Demo Controls ---------------------------------------- */

  function setLatest(machineId, key, value) {
    const rows = machineReadings(machineId).filter(r => r.key === key).sort((a, b) => b.recordedAt - a.recordedAt);
    if (!rows.length) return;
    const last = rows[0];
    last.value = round(value, key === 'power_factor' ? 2 : 1);
    last.recordedAt = Date.now();
    const p = paramDef(key);
    last.flagged = (p.max !== undefined && last.value > p.max) || (p.min !== undefined && last.value < p.min);
  }

  function applyState(name) {
    const active = STATE.machines.filter(m => m.status === 'active');
    if (!active.length) return;

    if (name === 'reset') {
      resetDemo();
      toast('Demo data reset', 'info');
      pushActivity({ type: 'demo', text: 'Demo reset to seeded state' });
      if (window.App.refreshAll) window.App.refreshAll();
      return;
    }

    if (name === 'healthy') {
      active.forEach(m => {
        setLatest(m.id, 'output_current', 60);
        setLatest(m.id, 'speed_rpm', 1500);
        setLatest(m.id, 'bearing_temp', 68);
        setLatest(m.id, 'coolant_temp', 74);
        setLatest(m.id, 'power_factor', 0.90);
        setLatest(m.id, 'oil_pressure', 4.1);
        setLatest(m.id, 'voltage', 401);
      });
      toast('Fleet set to HEALTHY', 'success');
      pushActivity({ type: 'demo', text: 'Demo control: all generators set to HEALTHY' });
    }

    if (name === 'warning') {
      const target = active[0];
      setLatest(target.id, 'output_current', 92);
      setLatest(target.id, 'bearing_temp', 98);
      setLatest(target.id, 'coolant_temp', 94);
      setLatest(target.id, 'power_factor', 0.76);
      setLatest(target.id, 'oil_pressure', 2.9);
      active.slice(1).forEach(m => {
        setLatest(m.id, 'output_current', 62);
        setLatest(m.id, 'bearing_temp', 70);
        setLatest(m.id, 'power_factor', 0.88);
      });
      toast(`${target.name} set to WARNING`, 'warning');
      pushActivity({ type: 'warning', text: `Demo control: ${target.name} set to WARNING state` });
    }

    if (name === 'critical') {
      const target = active[0];
      setLatest(target.id, 'output_current', 102);
      setLatest(target.id, 'bearing_temp', 122);
      setLatest(target.id, 'coolant_temp', 104);
      setLatest(target.id, 'oil_pressure', 2.0);
      setLatest(target.id, 'power_factor', 0.68);
      toast(`${target.name} set to CRITICAL`, 'error');
      pushActivity({ type: 'warning', text: `Demo control: ${target.name} set to CRITICAL state` });
    }

    saveState();
    markSync();
    if (window.App.refreshAll) window.App.refreshAll();
  }

  return {
    generateInsights, renderInsights, renderActivity, applyState,
  };
})();

window.App.demo = Demo;

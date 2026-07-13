/* =========================================================
   simulation.js — live generator simulation.
   Every few seconds, nudge the latest reading of each active
   machine for the primary parameters:
     Current      ±2 A
     RPM          ±5 rpm
     Temperature  ±1 °C
     Power Factor ±0.02
   Values are clamped to realistic bands. The latest reading is
   mutated in place (and timestamp bumped) so charts, health,
   recommendations and status all update live without unbounded
   growth of the stored dataset.
   ========================================================= */

const Simulation = (function () {
  let timer = null;
  const INTERVAL = 4000;

  /** Nudge the most recent reading of `key` for a machine. */
  function nudge(machineId, key, delta, min, max) {
    const rows = machineReadings(machineId).filter(r => r.key === key).sort((a, b) => b.recordedAt - a.recordedAt);
    if (!rows.length) return;
    const last = rows[0];
    let v = last.value + (Math.random() * 2 - 1) * delta;
    v = Math.min(max, Math.max(min, v));
    v = round(v, key === 'power_factor' ? 2 : 1);
    last.value = v;
    last.recordedAt = Date.now();
    const p = paramDef(key);
    last.flagged = (p.max !== undefined && v > p.max) || (p.min !== undefined && v < p.min);
  }

  function tick() {
    STATE.machines.filter(m => m.status === 'active').forEach(m => {
      nudge(m.id, 'output_current', 2, 0, 120);
      nudge(m.id, 'speed_rpm', 5, 1400, 1600);
      nudge(m.id, 'bearing_temp', 1, 40, 135);
      nudge(m.id, 'coolant_temp', 1, 40, 130);
      nudge(m.id, 'power_factor', 0.02, 0.6, 1.0);
      nudge(m.id, 'voltage', 1.5, 380, 420);
    });
    saveState();
    markSync();
    if (window.App.onSimTick) window.App.onSimTick();
  }

  function start() { if (timer) return; timer = setInterval(tick, INTERVAL); }
  function stop() { clearInterval(timer); timer = null; }
  function isRunning() { return !!timer; }

  return { start, stop, isRunning, tick };
})();

window.App.simulation = Simulation;

/* =========================================================
   health.js — metric & health calculations.
   These functions mirror the Postgres functions in the real
   project's migrations. They are preserved verbatim from the
   original dashboard. DO NOT rewrite the formulas.
   Everything reads from the global STATE object.
   ========================================================= */

/** All readings for a machine, unsorted. */
function machineReadings(machineId) { return STATE.readings.filter(r => r.machineId === machineId); }

/** Latest value for a parameter, optionally as-of timestamp `at`. */
function latestValue(machineId, key, at) {
  const at_ = at || Infinity;
  const rows = machineReadings(machineId)
    .filter(r => r.key === key && r.recordedAt <= at_)
    .sort((a, b) => b.recordedAt - a.recordedAt);
  return rows.length ? rows[0].value : null;
}

/** Look up a machine by id. */
function machineById(id) { return STATE.machines.find(m => m.id === id); }

/* ---- Physics metrics (trustworthy) ---- */
function getLoadingPct(machineId) {
  const m = machineById(machineId);
  const current = latestValue(machineId, 'output_current');
  if (current === null || !m.specs.rated_current) return null;
  return round((current / m.specs.rated_current) * 100, 1);
}

function getApparentPowerKva(machineId) {
  const v = latestValue(machineId, 'voltage'), i = latestValue(machineId, 'output_current');
  if (v === null || i === null) return null;
  const m = machineById(machineId);
  return round((m.phase === 'three_phase' ? Math.sqrt(3) * v * i : v * i) / 1000, 2);
}

function getRealPowerKw(machineId) {
  const apparent = getApparentPowerKva(machineId), pf = latestValue(machineId, 'power_factor');
  if (apparent === null || pf === null) return null;
  return round(apparent * pf, 2);
}

function getFrequencyHz(machineId) {
  const m = machineById(machineId), rpm = latestValue(machineId, 'speed_rpm');
  if (rpm === null || !m.specs.poles) return null;
  return round((rpm * m.specs.poles) / 120, 1);
}

function getThermalStressIndex(machineId) {
  const m = machineById(machineId), temp = latestValue(machineId, 'bearing_temp');
  if (temp === null) return null;
  const { rated_temp_normal: n, rated_temp_max: x } = m.specs;
  if (!n || !x || x <= n) return null;
  return round(Math.max(0, (temp - n) / (x - n) * 100), 1);
}

/* ---- Composite health ---- */
function getHealthIndex(machineId) {
  const loading = getLoadingPct(machineId), thermal = getThermalStressIndex(machineId), pf = latestValue(machineId, 'power_factor');
  let weightedSum = 0, totalWeight = 0;
  if (loading !== null) {
    const score = 100 - Math.min(100, Math.max(0, loading - 90) * 2 + Math.max(0, 70 - loading) * 1.5);
    weightedSum += score * 0.4; totalWeight += 0.4;
  }
  if (thermal !== null) {
    weightedSum += (100 - Math.min(100, thermal)) * 0.4; totalWeight += 0.4;
  }
  if (pf !== null) {
    weightedSum += Math.min(100, Math.max(0, pf / 0.85) * 100) * 0.2; totalWeight += 0.2;
  }
  if (totalWeight === 0) return null;
  return round(weightedSum / totalWeight, 1);
}

function getMaintenancePriorityScore(machineId) {
  const health = getHealthIndex(machineId);
  const cutoff = Date.now() - 30 * 86400000;
  const flaggedCount = machineReadings(machineId).filter(r => r.flagged && r.recordedAt >= cutoff).length;
  return round((health === null ? 50 : 100 - health) + flaggedCount * 5, 1);
}

/* ---- Heuristic / pending calibration metrics ---- */
function getOverloadIdleMinutes(machineId, mode) {
  const m = machineById(machineId);
  const rated = m.specs.rated_current;
  const rows = machineReadings(machineId).filter(r => r.key === 'output_current').sort((a, b) => a.recordedAt - b.recordedAt);
  let minutes = 0;
  for (let i = 0; i < rows.length; i++) {
    const next = rows[i + 1] ? rows[i + 1].recordedAt : Date.now();
    const durMin = (next - rows[i].recordedAt) / 60000;
    const isOverload = rows[i].value > rated;
    const isIdle = rows[i].value <= rated * 0.05;
    if ((mode === 'overload' && isOverload) || (mode === 'idle' && isIdle)) minutes += durMin;
  }
  return { minutes: round(minutes, 1), sampleCount: rows.length };
}

function getPowerFactorTrend(machineId) {
  const rows = machineReadings(machineId).filter(r => r.key === 'power_factor').sort((a, b) => a.recordedAt - b.recordedAt);
  if (rows.length < 3) return { direction: 'insufficient_data', sampleCount: rows.length };
  const n = rows.length;
  const xs = rows.map(r => r.recordedAt / 86400000), ys = rows.map(r => r.value);
  const xMean = xs.reduce((a, b) => a + b, 0) / n, yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - xMean) * (ys[i] - yMean); den += (xs[i] - xMean) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const direction = slope > 0.0005 ? 'improving' : slope < -0.0005 ? 'declining' : 'stable';
  return { direction, sampleCount: n };
}

function getSpecificFuelConsumption(machineId) {
  const cutoff = Date.now() - 30 * 86400000;
  const fuel = machineReadings(machineId).filter(r => r.key === 'fuel_level' && r.recordedAt >= cutoff).sort((a, b) => a.recordedAt - b.recordedAt);
  const kwh = machineReadings(machineId).filter(r => r.key === 'kwh_cumulative' && r.recordedAt >= cutoff).sort((a, b) => a.recordedAt - b.recordedAt);
  if (fuel.length < 2 || kwh.length < 2) return { lPerKwh: null, note: 'Not enough readings in this window yet.' };
  const refuels = STATE.refuels.filter(r => r.machineId === machineId && r.recordedAt >= cutoff).reduce((s, r) => s + r.liters, 0);
  const litersConsumed = (fuel[0].value - fuel[fuel.length - 1].value) + refuels;
  const kwhGenerated = kwh[kwh.length - 1].value - kwh[0].value;
  if (kwhGenerated <= 0) return { lPerKwh: null, note: 'No generation recorded in this window.' };
  if (litersConsumed < 0) return { lPerKwh: null, note: 'Fuel rose more than logged refuels explain.' };
  return { lPerKwh: round(litersConsumed / kwhGenerated, 3), note: 'ok' };
}

/* ---- Recommendation engine (rule based) ---- */
function getMaintenanceRecommendation(machineId) {
  const visitTimes = [...new Set(machineReadings(machineId).map(r => r.recordedAt))].sort((a, b) => b - a).slice(0, 10);
  const sampleCount = visitTimes.length;
  if (sampleCount < 3) return { status: 'insufficient_data', confidence: 'low', reasons: ['Fewer than 3 logged visits for this machine so far — not enough history for an assessment.'], sampleCount, avgIntervalHours: null };

  const flaggedVisits = visitTimes.filter(t => machineReadings(machineId).some(r => r.recordedAt === t && r.flagged)).length;
  const sorted = [...visitTimes].sort((a, b) => a - b);
  let gapSum = 0;
  for (let i = 1; i < sorted.length; i++) gapSum += (sorted[i] - sorted[i - 1]);
  const avgIntervalHours = sorted.length > 1 ? round(gapSum / (sorted.length - 1) / 3600000, 1) : null;

  const health = getHealthIndex(machineId), thermal = getThermalStressIndex(machineId);
  const reasons = [];
  if (flaggedVisits >= 3) reasons.push(`${flaggedVisits} of the last ${sampleCount} logged visits had at least one out-of-range reading`);
  if (health !== null && health < 50) reasons.push(`Health index is low (${health}/100)`);
  if (thermal !== null && thermal >= 100) reasons.push(`Thermal stress index is at or above the rated limit (${thermal}%)`);

  let status;
  if (reasons.length > 0) {
    status = 'needs_maintenance';
  } else {
    if (flaggedVisits >= 1) reasons.push(`${flaggedVisits} of the last ${sampleCount} logged visits had at least one out-of-range reading`);
    if (health !== null && health < 70) reasons.push(`Health index is trending low (${health}/100)`);
    if (thermal !== null && thermal >= 80) reasons.push(`Thermal stress index is elevated (${thermal}%)`);
    status = reasons.length > 0 ? 'watch' : 'healthy';
    if (status === 'healthy') reasons.push('No out-of-range readings and no elevated risk indicators in the recent history.');
  }

  let confidence;
  if (sampleCount >= 10 && avgIntervalHours !== null && avgIntervalHours <= 48) confidence = 'high';
  else if (sampleCount >= 5) confidence = 'medium';
  else confidence = 'low';

  return { status, confidence, reasons, sampleCount, avgIntervalHours };
}

/* ---- Status dot for a machine (preserved) ---- */
function statusDot(machineId) {
  const rec = getMaintenanceRecommendation(machineId);
  if (rec.status === 'needs_maintenance') return 'red';
  if (rec.status === 'watch') return 'amber';
  if (rec.status === 'healthy') return 'green';
  return '';
}

window.App.health = {
  machineReadings, latestValue, machineById,
  getLoadingPct, getApparentPowerKva, getRealPowerKw, getFrequencyHz,
  getThermalStressIndex, getHealthIndex, getMaintenancePriorityScore,
  getOverloadIdleMinutes, getPowerFactorTrend, getSpecificFuelConsumption,
  getMaintenanceRecommendation, statusDot,
};

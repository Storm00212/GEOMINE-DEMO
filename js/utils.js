/* =========================================================
   utils.js — shared helpers used across all modules.
   Pure functions only. No state mutation here.
   ========================================================= */

/* Global namespace to avoid polluting the global scope
   while keeping the app backend-free and build-tool free. */
window.App = window.App || {};

/**
 * PARAM_DEFS mirrors the real Postgres parameter_definitions table.
 * DO NOT change the keys — every calculation in health.js depends on them.
 */
const PARAM_DEFS = [
  { key: 'output_current', label: 'Output current', unit: 'A', sort: 1, max: 85, cumulative: false },
  { key: 'voltage', label: 'Voltage', unit: 'V', sort: 2, cumulative: false },
  { key: 'speed_rpm', label: 'Speed', unit: 'rpm', sort: 3, cumulative: false },
  { key: 'power_factor', label: 'Power factor', unit: '', sort: 4, cumulative: false },
  { key: 'bearing_temp', label: 'Bearing / stator temp', unit: '°C', sort: 5, max: 95, cumulative: false },
  { key: 'coolant_temp', label: 'Coolant temp', unit: '°C', sort: 6, max: 92, cumulative: false },
  { key: 'oil_pressure', label: 'Oil pressure', unit: 'bar', sort: 7, min: 2.8, cumulative: false },
  { key: 'battery_voltage', label: 'Battery voltage', unit: 'V', sort: 8, cumulative: false },
  { key: 'engine_hours', label: 'Engine hours', unit: 'hr', sort: 9, cumulative: true },
  { key: 'fuel_level', label: 'Fuel level', unit: 'L', sort: 10, min: 0, max: 190, cumulative: false },
  { key: 'kw_output', label: 'kW output', unit: 'kW', sort: 11, cumulative: false },
  { key: 'kwh_cumulative', label: 'kWh cumulative', unit: 'kWh', sort: 12, cumulative: true },
];

/** Look up a parameter definition by key. */
function paramDef(key) { return PARAM_DEFS.find(p => p.key === key); }

/** Random float in [min, max). */
function rnd(min, max) { return min + Math.random() * (max - min); }

/** Round to `d` decimal places. */
function round(v, d) { const m = Math.pow(10, d); return Math.round(v * m) / m; }

/** Format a value with an optional unit, or em-dash when missing. */
function fmt(v, unit) {
  return (v === null || v === undefined) ? '—' : `${v}${unit || ''}`;
}

/** Escape user supplied text before injecting into innerHTML. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tiny DOM helper — querySelector wrapper. */
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

/** Format a timestamp as a short local time HH:MM:SS. */
function clockTime(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Format a timestamp as a short local date+time for feeds. */
function fmtDateTime(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Human "x minutes ago" style relative time. */
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Status colour helper shared between cards, dots and charts. */
function statusColor(status) {
  switch (status) {
    case 'needs_maintenance': return 'var(--red)';
    case 'watch': return 'var(--amber)';
    case 'healthy': return 'var(--green)';
    default: return 'var(--text-faint)';
  }
}

/** Plain hex equivalents of the theme colours (Chart.js needs real colours). */
const THEME = {
  bg: '#181B21',
  panel: '#21252D',
  panelAlt: '#282D37',
  border: '#363C48',
  borderSoft: '#2C313C',
  text: '#EDEFF3',
  textDim: '#8D95A3',
  textFaint: '#5C6270',
  amber: '#E8A33D',
  green: '#4FAE7C',
  red: '#E0574F',
  cyan: '#4FC3D9',
};

window.App.PARAM_DEFS = PARAM_DEFS;
window.App.THEME = THEME;
window.App.util = { rnd, round, fmt, escapeHtml, clockTime, fmtDateTime, timeAgo, statusColor, paramDef };

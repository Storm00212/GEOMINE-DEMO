/* =========================================================
   store.js — localStorage "database".
   Stores: users, generators (machines), readings, faults,
   refuels, session, settings and the activity feed.
   No backend. Everything is persisted to localStorage so the
   demo survives a page refresh.
   ========================================================= */

const STORAGE_KEY = 'geomine_demo_state_v1';
const USERS_KEY = 'geomine_users_v1';
const SESSION_KEY = 'geomine_session_v1';        // persistent (Remember Me)
const SESSION_TEMP_KEY = 'geomine_session_temp_v1'; // sessionStorage (no remember)
const ACTIVITY_KEY = 'geomine_activity_v1';
const SETTINGS_KEY = 'geomine_settings_v1';

/* ---------------------------------------------------------
   DEFAULT DEMO USERS
   These are seeded on first load. Each user maps to a role.
   The original dashboard had miner / it / admin views — we
   preserve all three roles so no functionality is lost.
   --------------------------------------------------------- */

const DEFAULT_USERS = [
  { id: 'u_admin', name: 'David O.', email: 'admin@geomine.com', password: 'admin123', role: 'admin', title: 'Fleet Operations Lead' },
  { id: 'u_miner', name: 'James K.', email: 'miner@geomine.com', password: 'miner123', role: 'miner', title: 'Field Technician' },
  { id: 'u_it',    name: 'Sarah M.', email: 'it@geomine.com',    password: 'it123',    role: 'it',    title: 'Systems Engineer' },
];

/* ---------------------------------------------------------
   SEED DATA
   buildSeed() reproduces the original demo dataset exactly so
   existing calculations behave identically to the source app.
   --------------------------------------------------------- */
function buildSeed() {
  const machines = [
    { id: 'g1', name: 'Generator 1', location: 'Site A — Crusher Plant', status: 'active', phase: 'three_phase',
      specs: { rated_current: 79.4, poles: 4, rated_temp_normal: 65, rated_temp_max: 105 } },
    { id: 'g2', name: 'Generator 2', location: 'Site A — Admin Block', status: 'active', phase: 'three_phase',
      specs: { rated_current: 79.4, poles: 4, rated_temp_normal: 65, rated_temp_max: 105 } },
    { id: 'g3', name: 'Generator 3', location: 'Site B — East Pit', status: 'active', phase: 'three_phase',
      specs: { rated_current: 79.4, poles: 4, rated_temp_normal: 65, rated_temp_max: 105 } },
    { id: 'g4', name: 'Generator 4', location: 'Site B — Workshop', status: 'active', phase: 'three_phase',
      specs: { rated_current: 79.4, poles: 4, rated_temp_normal: 65, rated_temp_max: 105 } },
    { id: 'g5', name: 'Generator 5', location: 'Site B — Camp', status: 'active', phase: 'three_phase',
      specs: { rated_current: 79.4, poles: 4, rated_temp_normal: 65, rated_temp_max: 105 } },
    { id: 'g6', name: 'Generator 6', location: 'Site A — Water Pump Station', status: 'maintenance', phase: 'three_phase',
      specs: { rated_current: 79.4, poles: 4, rated_temp_normal: 65, rated_temp_max: 105 } },
  ];

  const engineHoursBase = { g1: 1150, g2: 640, g3: 1204, g4: 300, g5: 2100, g6: 3400 };
  const kwhBase = { g1: 91000, g2: 54000, g3: 88000, g4: 21000, g5: 145000, g6: 210000 };

  const readings = [];
  const refuels = [];
  const faults = [];
  let readingId = 1;
  const now = Date.now();
  const visitsPerMachine = 28; // ~12 hours apart over 14 days

  machines.forEach(m => {
    for (let v = 1; v <= visitsPerMachine; v++) {
      const recordedAt = now - (visitsPerMachine - v) * 12 * 3600 * 1000;
      const spike = (m.id === 'g1');
      const values = {
        voltage: rnd(398, 404),
        output_current: (spike && v % 5 === 0) ? rnd(88, 98) : rnd(52, 70),
        speed_rpm: rnd(1495, 1505),
        power_factor: rnd(0.80, 0.90),
        bearing_temp: (spike && v % 6 === 0) ? rnd(100, 115) : rnd(64, 78),
        coolant_temp: (spike && v % 7 === 0) ? rnd(96, 105) : rnd(68, 84),
        oil_pressure: (spike && v % 8 === 0) ? rnd(2.0, 2.4) : rnd(3.7, 4.5),
        battery_voltage: rnd(25.2, 27.0),
        engine_hours: engineHoursBase[m.id] + v * 4,
        fuel_level: Math.min(190, Math.max(20, 190 - (v % 9) * 20 + rnd(0, 8))),
        kw_output: rnd(28, 42),
        kwh_cumulative: kwhBase[m.id] + v * 47,
      };
      PARAM_DEFS.forEach(p => {
        const val = round(values[p.key], p.key === 'power_factor' ? 2 : 1);
        const flagged = (p.max !== undefined && val > p.max) || (p.min !== undefined && val < p.min);
        readings.push({
          id: readingId++, machineId: m.id, key: p.key, value: val,
          recordedAt, enteredBy: 'admin', flagged: !!flagged,
        });
      });
    }
    // refuels roughly every 3 days
    for (let d = 1; d < 14; d += 3) {
      refuels.push({ machineId: m.id, liters: round(rnd(140, 160), 1), recordedAt: now - (14 - d) * 24 * 3600 * 1000 });
    }
  });

  faults.push({ id: 'f1', machineId: 'g1', code: 'E-042', description: 'Low oil pressure alarm', resolved: false, recordedAt: now - 5 * 86400000 });
  faults.push({ id: 'f2', machineId: 'g1', code: 'E-017', description: 'Overcurrent trip', resolved: false, recordedAt: now - 2 * 86400000 });
  faults.push({ id: 'f3', machineId: 'g3', code: 'E-042', description: 'Low oil pressure alarm', resolved: true, recordedAt: now - 12 * 86400000 });

  return { machines, readings, refuels, faults, nextReadingId: readingId };
}

/* ---------------------------------------------------------
   STATE LOAD / SAVE
   STATE holds the live working set (machines, readings, etc.)
   --------------------------------------------------------- */
let STATE = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through to fresh seed */ }
  const seed = buildSeed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
}

function resetDemo() {
  localStorage.removeItem(STORAGE_KEY);
  STATE = loadState();
  pushActivity({ type: 'system', text: 'Demo data was reset to the seeded starting point' });
}

/* ---------------------------------------------------------
   USERS (auth store)
   --------------------------------------------------------- */
function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* seed defaults */ }
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  return JSON.parse(JSON.stringify(DEFAULT_USERS));
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function findUserByEmail(email) {
  return loadUsers().find(u => u.email.toLowerCase() === String(email).toLowerCase().trim());
}

/* ---------------------------------------------------------
   ACTIVITY FEED
   A ring buffer of recent events shown in the admin activity
   panel. Each entry: {id, type, text, at}
   --------------------------------------------------------- */
function loadActivity() {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* empty */ }
  return [];
}

function saveActivity(list) {
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(list.slice(0, 80)));
}

let _activitySeq = Date.now();
function pushActivity(entry) {
  const list = loadActivity();
  list.unshift({
    id: 'a' + (_activitySeq++),
    type: entry.type || 'event',
    text: entry.text,
    at: entry.at || Date.now(),
    meta: entry.meta || null,
  });
  saveActivity(list);
  if (window.App && window.App.onActivity) window.App.onActivity(list[0], list);
}

/* ---------------------------------------------------------
   SETTINGS
   Light housekeeping / demo preferences.
   --------------------------------------------------------- */
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* defaults */ }
  return { simulationOn: true, lastSync: Date.now() };
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/* Expose store API */
window.App.store = {
  STORAGE_KEY, USERS_KEY, SESSION_KEY, SESSION_TEMP_KEY, ACTIVITY_KEY,
  DEFAULT_USERS, buildSeed,
  loadState, saveState, resetDemo,
  loadUsers, saveUsers, findUserByEmail,
  loadActivity, saveActivity, pushActivity,
  loadSettings, saveSettings,
};

/* Mark a sync so the UI can show "Last sync" timestamps. */
function markSync() {
  const s = loadSettings();
  s.lastSync = Date.now();
  saveSettings(s);
  if (window.App.onSync) window.App.onSync(s.lastSync);
}

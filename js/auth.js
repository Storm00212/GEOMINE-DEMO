/* =========================================================
   auth.js — authentication & sessions (localStorage only).
   Default demo accounts are seeded on first run:
     admin@geomine.com / admin123   (Admin)
     miner@geomine.com  / miner123   (Miner)
     it@geomine.com     / it123      (IT / Systems)
   "Remember Me" chooses between localStorage (persistent) and
   sessionStorage (cleared when the tab closes).
   ========================================================= */

const Auth = (function () {
  function getSession() {
    try {
      const pers = localStorage.getItem(SESSION_KEY);
      if (pers) return JSON.parse(pers);
    } catch (e) {}
    try {
      const temp = sessionStorage.getItem(SESSION_TEMP_KEY);
      if (temp) return JSON.parse(temp);
    } catch (e) {}
    return null;
  }

  function setSession(user, remember) {
    const payload = { id: user.id, name: user.name, email: user.email, role: user.role, title: user.title, at: Date.now() };
    if (remember) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
      sessionStorage.removeItem(SESSION_TEMP_KEY);
    } else {
      sessionStorage.setItem(SESSION_TEMP_KEY, JSON.stringify(payload));
      localStorage.removeItem(SESSION_KEY);
    }
    return payload;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_TEMP_KEY);
  }

  /**
   * Authenticate by email + password.
   * Returns { ok, user } or { ok:false, error }.
   */
  function login(email, password, remember) {
    const user = findUserByEmail(email);
    if (!user) return { ok: false, error: 'No account found for that email.' };
    if (user.password !== password) return { ok: false, error: 'Incorrect password. Try the demo credentials.' };
    const session = setSession(user, remember);
    return { ok: true, user: session };
  }

  /**
   * Register a new miner. Email must be unique.
   * New self-registered users are always role 'miner'.
   */
  function signup(name, email, password) {
    const users = loadUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase().trim())) {
      return { ok: false, error: 'An account with that email already exists.' };
    }
    const user = {
      id: 'u_' + Date.now(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'miner',
      title: 'Field Technician',
    };
    users.push(user);
    saveUsers(users);
    return { ok: true, user: setSession(user, false) };
  }

  /** Role → landing screen after login. */
  function landingFor(role) {
    if (role === 'miner') return 'entry';
    return 'dashboard';
  }

  /** Redirect the browser to the dashboard if authenticated. */
  function redirectIfAuthed() {
    if (getSession()) { window.location.href = 'dashboard.html'; }
  }

  /** On the dashboard: bounce to login if not authenticated. */
  function requireAuth() {
    const s = getSession();
    if (!s) { window.location.href = 'index.html'; return null; }
    return s;
  }

  function logout() {
    clearSession();
    window.location.href = 'index.html';
  }

  return {
    getSession, login, signup, logout, requireAuth, redirectIfAuthed, landingFor,
    current: getSession,
  };
})();

window.App.auth = Auth;

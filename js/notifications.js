/* =========================================================
   notifications.js — toast popups + slide-in notification
   centre. The classic `toast(msg)` function is kept global so
   the preserved dashboard code keeps working unchanged.
   ========================================================= */

/* In-memory ring of recent toasts for the notification centre. */
const _toastLog = [];

/**
 * Show a transient toast in the bottom-right corner.
 * type: 'success' | 'info' | 'warning' | 'error'
 */
function toast(msg, type) {
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = msg;
    el.className = 'toast show' + (type ? ' toast-' + type : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'toast'; }, 2600);
  }
  _toastLog.unshift({ msg, type: type || 'success', at: Date.now() });
  if (window.App && window.App.onToast) window.App.onToast(_toastLog[0]);
}

/**
 * Build (once) the notification centre drawer and return helpers.
 * Toggled by the bell button in the topbar.
 */
const Notifications = (function () {
  let panel = null;

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'notif-center';
    panel.innerHTML = `
      <div class="notif-head">
        <span><i class="fa-solid fa-bell"></i> Notifications</span>
        <button class="notif-close" title="Close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="notif-body" id="notifBody"></div>`;
    document.body.appendChild(panel);
    panel.querySelector('.notif-close').addEventListener('click', close);
    render();
    return panel;
  }

  function render() {
    const body = document.getElementById('notifBody');
    if (!body) return;
    if (!_toastLog.length) {
      body.innerHTML = `<div class="notif-empty">No notifications yet. System events will appear here.</div>`;
      return;
    }
    body.innerHTML = _toastLog.slice(0, 30).map(t => `
      <div class="notif-item notif-${t.type}">
        <i class="fa-solid ${iconFor(t.type)}"></i>
        <div class="notif-text">
          <div class="notif-msg">${escapeHtml(t.msg)}</div>
          <div class="notif-time">${timeAgo(t.at)}</div>
        </div>
      </div>`).join('');
  }

  function iconFor(type) {
    return ({ success: 'fa-circle-check', info: 'fa-circle-info', warning: 'fa-triangle-exclamation', error: 'fa-circle-exclamation' })[type] || 'fa-circle-check';
  }

  function open() { ensurePanel().classList.add('open'); render(); }
  function close() { if (panel) panel.classList.remove('open'); }

  return {
    push: function (msg, type) { toast(msg, type); },
    open: open, close: close, render: render,
    toggle: function () { ensurePanel().classList.toggle('open'); render(); },
    unread: function () { return _toastLog.length; },
  };
})();

window.App.notifications = Notifications;
window.App.toast = toast;

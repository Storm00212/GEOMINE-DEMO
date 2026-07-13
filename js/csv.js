/* =========================================================
   csv.js — CSV export of logged readings.
   Logic preserved from the original dashboard (downloadCsv),
   extended with a reusable buildCsv() helper used by the
   toolbar "Export CSV" button.
   ========================================================= */

/** Build CSV text for the given filter window. */
function buildCsv(machineId, from, to) {
  const rows = STATE.readings.filter(r =>
    (machineId === 'all' || r.machineId === machineId) &&
    r.recordedAt >= from && r.recordedAt <= to
  );
  const header = 'Machine,Parameter,Value,Unit,Recorded At,Flagged\n';
  const body = rows.map(r => {
    const m = machineById(r.machineId), p = paramDef(r.key);
    return [m.name, p.label, r.value, p.unit, new Date(r.recordedAt).toISOString(), r.flagged ? 'yes' : 'no']
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  }).join('\n');
  return { text: header + body, count: rows.length };
}

/** Trigger a browser download of the filtered readings. */
function downloadCsv() {
  const machineId = (document.getElementById('reportMachine') || {}).value || 'all';
  const fromEl = document.getElementById('reportFrom');
  const toEl = document.getElementById('reportTo');
  const from = fromEl ? new Date(fromEl.value).getTime() : 0;
  const to = toEl ? new Date(toEl.value).getTime() + 86400000 : Date.now();
  const { text, count } = buildCsv(machineId, from, to);
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `geomine-readings-${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast(`Exported ${count} readings`);
  pushActivity({ type: 'export', text: `CSV export downloaded (${count} readings)` });
}

window.App.csv = { buildCsv, downloadCsv };

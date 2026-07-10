(() => {
  const view = document.getElementById('view');
  const modalRoot = document.getElementById('modalRoot');
  const tabBtns = document.querySelectorAll('.tab-btn');

  let currentTab = 'log';
  let progressExerciseId = null;

  // Draft state for the "add a set of logs" form on the Log tab.
  let logDraft = { exerciseId: '', planExerciseIds: null, sets: [{ weight: '', reps: '' }], date: todayISO() };

  const CARDIO_FIELDS = [
    { key: 'time', placeholder: 'time (min)' },
    { key: 'incline', placeholder: 'incline %' },
    { key: 'speed', placeholder: 'speed (mph)' },
  ];
  const STRENGTH_FIELDS = [
    { key: 'weight', placeholder: null },
    { key: 'reps', placeholder: 'reps' },
  ];

  // ---------- helpers ----------
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function fmtDate(dstr) {
    const d = new Date(dstr + (dstr.length <= 10 ? 'T00:00:00' : ''));
    const today = todayISO();
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const key = dstr.slice(0, 10);
    if (key === today) return 'Today';
    if (key === yest) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function unit() {
    return DB.state.settings.unit || 'lbs';
  }

  // ---------- backup reminders ----------
  const BACKUP_KEY = 'workoutTrackerLastBackup';
  const BACKUP_DISMISS_KEY = 'workoutTrackerBackupDismissUntil';
  function daysSince(ts) {
    return Math.floor((Date.now() - ts) / 86400000);
  }
  function lastBackupInfo() {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return { never: true, days: null };
    return { never: false, days: daysSince(Number(raw)) };
  }
  function markBackedUp() {
    localStorage.setItem(BACKUP_KEY, String(Date.now()));
  }
  function backupIsOverdue() {
    const info = lastBackupInfo();
    if (!DB.state.logs.length) return false; // nothing to lose yet
    if (info.never) return true;
    return info.days >= 21;
  }
  function backupDismissed() {
    const raw = localStorage.getItem(BACKUP_DISMISS_KEY);
    return raw && Number(raw) > Date.now();
  }
  function dismissBackupBanner() {
    localStorage.setItem(BACKUP_DISMISS_KEY, String(Date.now() + 3 * 86400000)); // snooze 3 days
  }
  function renderBackupBanner() {
    if (!backupIsOverdue() || backupDismissed()) return '';
    return `
      <div class="backup-banner" data-action="none">
        <span>${lastBackupInfo().never ? "You haven't backed up your data yet." : `It's been ${lastBackupInfo().days} days since your last backup.`} </span>
        <div class="backup-banner-actions">
          <button class="btn small" data-action="backup-now">Export now</button>
          <button class="btn ghost small" data-action="dismiss-backup">Not now</button>
        </div>
      </div>
    `;
  }
  function doExport() {
    const blob = new Blob([DB.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workout-data-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    markBackedUp();
  }
  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function exerciseOptions(selectedId) {
    const exs = DB.state.exercises.slice().sort((a, b) => a.name.localeCompare(b.name));
    return (
      '<option value="">Select exercise…</option>' +
      exs.map((e) => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')
    );
  }
  function exerciseType(exId) {
    return DB.exerciseById(exId)?.type === 'cardio' ? 'cardio' : 'strength';
  }
  function fieldsForType(type) {
    return type === 'cardio' ? CARDIO_FIELDS : STRENGTH_FIELDS;
  }
  function emptySet(type) {
    const out = {};
    fieldsForType(type).forEach((f) => (out[f.key] = ''));
    return out;
  }
  function setDraftDefaultsForExercise(exId) {
    const type = exerciseType(exId);
    const lastLog = DB.logsForExercise(exId).slice(-1)[0];
    if (lastLog) {
      logDraft.sets = lastLog.sets.map((s) => {
        const out = {};
        fieldsForType(type).forEach((f) => (out[f.key] = s[f.key] !== undefined ? String(s[f.key]) : ''));
        return out;
      });
    } else {
      logDraft.sets = [emptySet(type)];
    }
  }

  function render() {
    tabBtns.forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
    if (currentTab === 'log') renderLog();
    else if (currentTab === 'plans') renderPlans();
    else if (currentTab === 'progress') renderProgress();
    else if (currentTab === 'weight') renderWeight();
    else if (currentTab === 'history') renderHistory();
  }

  // ---------- LOG TAB ----------
  function renderLog() {
    const dayLogs = DB.logsOnDay(logDraft.date);
    const isToday = logDraft.date === todayISO();
    view.innerHTML = `
      <h2>Log a workout</h2>
      ${renderBackupBanner()}
      <div class="card">
        <div class="field">
          <label>Date</label>
          <input type="date" id="logDateInput" value="${logDraft.date}" max="${todayISO()}" />
        </div>
        <div class="field">
          <label>Exercise</label>
          <select id="exerciseSelect">${exerciseOptions(logDraft.exerciseId)}</select>
        </div>
        <div id="setsContainer"></div>
        <button class="btn secondary" data-action="add-set" style="margin-bottom:10px;">+ Add set</button>
        <button class="btn" data-action="save-log">Save workout</button>
      </div>

      <button class="btn ghost" data-action="manage-exercises">Manage exercises</button>

      ${renderPlanQuickStart()}

      <div class="section-gap">
        <h3>${isToday ? 'Today' : fmtDate(logDraft.date)}${dayLogs.length ? '' : ' — nothing logged yet'}</h3>
        ${dayLogs.length ? renderLogEntries(dayLogs) : ''}
      </div>
    `;
    renderSetsInto(document.getElementById('setsContainer'));
  }

  function renderPlanQuickStart() {
    if (!DB.state.plans.length) return '';
    return `
      <div class="section-gap">
        <h3>Quick-start from a plan</h3>
        <div class="card">
          ${DB.state.plans
            .map(
              (p) => `<button class="chip" data-action="pick-plan-exercise" data-plan="${p.id}" style="border:none;cursor:pointer;">${esc(p.name)}</button>`
            )
            .join('')}
        </div>
      </div>
    `;
  }

  function renderSetsInto(container) {
    if (!container) return;
    const type = exerciseType(logDraft.exerciseId);
    const fields = fieldsForType(type);
    container.innerHTML = logDraft.sets
      .map((s, i) => {
        const inputs = fields
          .map((f, fi) => {
            const placeholder = f.key === 'weight' ? `weight (${unit()})` : f.placeholder;
            const sep = type === 'strength' && fi === 0 ? '<span class="x">×</span>' : '';
            return `<input type="number" inputmode="decimal" placeholder="${esc(placeholder)}" data-set-field="${f.key}" data-idx="${i}" value="${esc(s[f.key])}" />${sep}`;
          })
          .join('');
        return `
      <div class="set-row">
        <span class="set-idx">${i + 1}</span>
        ${inputs}
        ${logDraft.sets.length > 1 ? `<button class="remove-set" data-action="remove-set" data-idx="${i}">✕</button>` : ''}
      </div>`;
      })
      .join('');
  }

  function formatSet(s, type) {
    if (type === 'cardio') {
      const parts = [];
      if (s.time) parts.push(`${s.time}min`);
      if (s.incline) parts.push(`${s.incline}% incline`);
      if (s.speed) parts.push(`${s.speed}mph`);
      return parts.join(' • ') || '—';
    }
    return `${s.weight}${unit()}×${s.reps}`;
  }
  function setsSummary(l) {
    const type = exerciseType(l.exerciseId);
    return l.sets.map((s) => formatSet(s, type)).join(', ');
  }

  function renderLogEntries(entries) {
    return `<div class="card">${entries
      .slice()
      .reverse()
      .map((l) => {
        const ex = DB.exerciseById(l.exerciseId);
        const setsStr = setsSummary(l);
        return `
        <div class="list-item">
          <div>
            <div>${esc(ex ? ex.name : 'Unknown exercise')}</div>
            <div class="meta">${esc(setsStr)}</div>
          </div>
          <div class="actions">
            <button data-action="edit-log" data-id="${l.id}" aria-label="Edit">✏️</button>
            <button data-action="delete-log" data-id="${l.id}" aria-label="Delete">🗑</button>
          </div>
        </div>`;
      })
      .join('')}</div>`;
  }

  // Lets you fix a past entry (or add a forgotten set to it) without
  // re-entering everything from scratch.
  function editLogModal(log) {
    const ex = DB.exerciseById(log.exerciseId);
    const type = exerciseType(log.exerciseId);
    let draftSets = log.sets.map((s) => {
      const out = {};
      fieldsForType(type).forEach((f) => (out[f.key] = s[f.key] !== undefined ? String(s[f.key]) : ''));
      return out;
    });
    let draftDate = log.date.slice(0, 10);

    openModal(
      ex ? `Edit ${ex.name}` : 'Edit entry',
      `
      <div class="field">
        <label>Date</label>
        <input type="date" id="editLogDate" value="${draftDate}" max="${todayISO()}" />
      </div>
      <div id="editSetsContainer"></div>
      <button class="btn secondary" id="editAddSetBtn" style="margin-bottom:10px;">+ Add set</button>
      <button class="btn" id="editSaveBtn">Save changes</button>
    `
    );

    function renderEditSets() {
      const container = document.getElementById('editSetsContainer');
      if (!container) return;
      const fields = fieldsForType(type);
      container.innerHTML = draftSets
        .map((s, i) => {
          const inputs = fields
            .map((f, fi) => {
              const placeholder = f.key === 'weight' ? `weight (${unit()})` : f.placeholder;
              const sep = type === 'strength' && fi === 0 ? '<span class="x">×</span>' : '';
              return `<input type="number" inputmode="decimal" placeholder="${esc(placeholder)}" data-edit-field="${f.key}" data-idx="${i}" value="${esc(s[f.key])}" />${sep}`;
            })
            .join('');
          return `
        <div class="set-row">
          <span class="set-idx">${i + 1}</span>
          ${inputs}
          ${draftSets.length > 1 ? `<button class="remove-set" data-edit-remove="${i}">✕</button>` : ''}
        </div>`;
        })
        .join('');
    }
    renderEditSets();

    document.getElementById('editLogDate').addEventListener('change', (e) => {
      draftDate = e.target.value;
    });
    document.getElementById('editSetsContainer').addEventListener('input', (e) => {
      const field = e.target.dataset.editField;
      if (field) {
        const idx = Number(e.target.dataset.idx);
        draftSets[idx][field] = e.target.value;
      }
    });
    document.getElementById('editSetsContainer').addEventListener('click', (e) => {
      const idx = e.target.dataset.editRemove;
      if (idx !== undefined) {
        draftSets.splice(Number(idx), 1);
        renderEditSets();
      }
    });
    document.getElementById('editAddSetBtn').addEventListener('click', () => {
      const last = draftSets.at(-1) || {};
      const next = {};
      fieldsForType(type).forEach((f) => (next[f.key] = last[f.key] || ''));
      draftSets.push(next);
      renderEditSets();
    });
    document.getElementById('editSaveBtn').addEventListener('click', () => {
      const validSets = draftSets.filter((s) => Object.values(s).some((v) => v !== ''));
      if (!validSets.length) {
        alert('Add at least one set.');
        return;
      }
      const coerced = validSets.map((s) => {
        const out = {};
        Object.keys(s).forEach((k) => (out[k] = Number(s[k]) || 0));
        return out;
      });
      DB.updateLog(log.id, { date: draftDate || log.date, sets: coerced });
      closeModal();
      render();
    });
  }

  // ---------- PLANS TAB ----------
  function renderPlans() {
    view.innerHTML = `
      <h2>Workout plans</h2>
      <button class="btn" data-action="new-plan" style="margin-bottom:16px;">+ New plan</button>
      ${
        DB.state.plans.length
          ? DB.state.plans
              .map((p) => {
                const names = p.exerciseIds.map((id) => DB.exerciseById(id)?.name).filter(Boolean);
                return `
              <div class="card">
                <h3 style="color:#eef0f3;font-size:16px;">${esc(p.name)}</h3>
                <div style="margin-bottom:10px;">${
                  names.length ? names.map((n) => `<span class="chip">${esc(n)}</span>`).join('') : '<span class="meta">No exercises yet</span>'
                }</div>
                <div class="row">
                  <button class="btn secondary small" data-action="edit-plan" data-id="${p.id}">Edit</button>
                  <button class="btn danger small" data-action="delete-plan" data-id="${p.id}">Delete</button>
                </div>
              </div>`;
              })
              .join('')
          : '<div class="empty-state">No plans yet. Create one to quickly log recurring workouts.</div>'
      }
    `;
  }

  function planFormModal(existingPlan) {
    const selected = new Set(existingPlan ? existingPlan.exerciseIds : []);
    const exs = DB.state.exercises.slice().sort((a, b) => a.name.localeCompare(b.name));
    openModal(
      existingPlan ? 'Edit plan' : 'New plan',
      `
      <div class="field">
        <label>Plan name</label>
        <input id="planNameInput" type="text" value="${existingPlan ? esc(existingPlan.name) : ''}" placeholder="e.g. Push day" />
      </div>
      <div class="field">
        <label>Exercises</label>
        <div class="checkbox-list" id="planExerciseList">
          ${exs
            .map(
              (e) => `<label><input type="checkbox" value="${e.id}" ${selected.has(e.id) ? 'checked' : ''}/> ${esc(e.name)}</label>`
            )
            .join('')}
        </div>
      </div>
      <button class="btn" id="savePlanBtn">${existingPlan ? 'Save changes' : 'Create plan'}</button>
    `
    );
    document.getElementById('savePlanBtn').addEventListener('click', () => {
      const name = document.getElementById('planNameInput').value.trim();
      if (!name) return;
      const ids = Array.from(document.querySelectorAll('#planExerciseList input:checked')).map((c) => c.value);
      if (existingPlan) DB.updatePlan(existingPlan.id, { name, exerciseIds: ids });
      else DB.addPlan(name, ids);
      closeModal();
      render();
    });
  }

  // ---------- PROGRESS TAB ----------
  function renderProgress() {
    if (!progressExerciseId && DB.state.exercises.length) progressExerciseId = DB.state.exercises[0].id;
    const type = exerciseType(progressExerciseId);
    const logs = progressExerciseId ? DB.logsForExercise(progressExerciseId) : [];

    let bestValue = 0,
      totalSessions = logs.length,
      lastDate = '—';
    const metricKey = type === 'cardio' ? 'speed' : 'weight';
    logs.forEach((l) => l.sets.forEach((s) => (bestValue = Math.max(bestValue, s[metricKey] || 0))));
    if (logs.length) lastDate = fmtDate(logs[logs.length - 1].date);
    const bestLabel = type === 'cardio' ? 'MAX SPEED' : `MAX ${unit().toUpperCase()}`;

    view.innerHTML = `
      <h2>Progress</h2>
      <div class="field">
        <select id="progressExerciseSelect">${exerciseOptions(progressExerciseId)}</select>
      </div>

      <div class="stat-grid">
        <div class="stat-box"><div class="val">${bestValue || '—'}</div><div class="lbl">${bestLabel}</div></div>
        <div class="stat-box"><div class="val">${totalSessions}</div><div class="lbl">SESSIONS</div></div>
        <div class="stat-box"><div class="val">${lastDate}</div><div class="lbl">LAST DONE</div></div>
      </div>

      <canvas id="progressChart" width="600" height="180"></canvas>

      <div class="section-gap">
        <h3>Session history</h3>
        ${
          logs.length
            ? `<div class="card">${logs
                .slice()
                .reverse()
                .map((l) => {
                  const best = l.sets.reduce((m, s) => Math.max(m, s[metricKey] || 0), 0);
                  const setsStr = setsSummary(l);
                  const bestStr = type === 'cardio' ? `top ${best}mph` : `best ${best}${unit()}`;
                  return `<div class="list-item"><div><div>${fmtDate(l.date)}</div><div class="meta">${esc(setsStr)}</div></div><div class="meta">${bestStr}</div></div>`;
                })
                .join('')}</div>`
            : '<div class="empty-state">No history for this exercise yet.</div>'
        }
      </div>
    `;

    drawChart(logs, metricKey);
  }

  function drawChart(logs, metricKey) {
    const points = logs.map((l) => Math.max(...l.sets.map((s) => s[metricKey] || 0)));
    drawPointsChart('progressChart', points);
  }

  function drawWeightChart(entries) {
    drawPointsChart('weightChart', entries.map((e) => e.weight));
  }

  function drawPointsChart(canvasId, points) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (points.length < 1) {
      ctx.fillStyle = '#7d8390';
      ctx.font = '13px sans-serif';
      ctx.fillText('No data yet', 16, h / 2);
      return;
    }
    const padding = 24;
    const maxY = Math.max(...points, 1);
    const minY = Math.min(...points, 0);
    const range = maxY - minY || 1;
    const stepX = points.length > 1 ? (w - padding * 2) / (points.length - 1) : 0;

    ctx.strokeStyle = '#362a4d';
    ctx.beginPath();
    ctx.moveTo(padding, h - padding);
    ctx.lineTo(w - padding, h - padding);
    ctx.stroke();

    const grad = ctx.createLinearGradient(padding, 0, w - padding, 0);
    grad.addColorStop(0, '#ff6fb3');
    grad.addColorStop(1, '#8b5cf6');

    ctx.beginPath();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    points.forEach((p, i) => {
      const x = padding + stepX * i;
      const y = h - padding - ((p - minY) / range) * (h - padding * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#ff6fb3';
    points.forEach((p, i) => {
      const x = padding + stepX * i;
      const y = h - padding - ((p - minY) / range) * (h - padding * 2);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#ad9fc7';
    ctx.font = '11px sans-serif';
    ctx.fillText(String(maxY), 4, padding);
    ctx.fillText(String(minY), 4, h - padding + 4);
  }

  // ---------- WEIGHT TAB ----------
  function renderWeight() {
    const entries = DB.bodyWeightsSorted();
    const todayEntry = entries.find((e) => e.date === todayISO());
    const latest = entries.length ? entries[entries.length - 1] : null;
    const first = entries.length ? entries[0] : null;
    const hasChange = entries.length > 1;
    const change = hasChange ? latest.weight - first.weight : 0;
    const changeStr = hasChange ? `${change > 0 ? '+' : ''}${change.toFixed(1)}${unit()}` : '—';

    view.innerHTML = `
      <h2>Body weight</h2>
      <div class="card">
        <div class="row">
          <div class="field">
            <label>Date</label>
            <input type="date" id="weightDateInput" value="${todayISO()}" />
          </div>
          <div class="field">
            <label>Weight (${unit()})</label>
            <input type="number" inputmode="decimal" id="weightValueInput" placeholder="e.g. 145" value="${todayEntry ? todayEntry.weight : ''}" />
          </div>
        </div>
        <button class="btn" data-action="save-weight">Save weight</button>
      </div>

      <div class="stat-grid">
        <div class="stat-box"><div class="val">${latest ? latest.weight : '—'}</div><div class="lbl">CURRENT ${unit().toUpperCase()}</div></div>
        <div class="stat-box"><div class="val">${entries.length}</div><div class="lbl">ENTRIES</div></div>
        <div class="stat-box"><div class="val">${changeStr}</div><div class="lbl">CHANGE</div></div>
      </div>

      <canvas id="weightChart" width="600" height="180"></canvas>

      <div class="section-gap">
        <h3>History</h3>
        ${
          entries.length
            ? `<div class="card">${entries
                .slice()
                .reverse()
                .map(
                  (e) => `
              <div class="list-item">
                <div>${fmtDate(e.date)}</div>
                <div style="display:flex;align-items:center;gap:14px;">
                  <div class="meta">${e.weight}${unit()}</div>
                  <div class="actions"><button data-action="delete-weight" data-id="${e.id}" aria-label="Delete">🗑</button></div>
                </div>
              </div>`
                )
                .join('')}</div>`
            : "<div class=\"empty-state\">No weight logged yet. Add today's weight above.</div>"
        }
      </div>
    `;

    drawWeightChart(entries);
  }

  // ---------- HISTORY TAB ----------
  function renderHistory() {
    const days = DB.allDays();
    if (!days.length) {
      view.innerHTML = '<h2>History</h2><div class="empty-state">No workouts logged yet. Head to the Log tab to add one.</div>';
      return;
    }
    view.innerHTML =
      '<h2>History</h2>' +
      days
        .map((day) => {
          const entries = DB.logsOnDay(day);
          return `
          <div class="day-header">${fmtDate(day)}</div>
          ${renderLogEntries(entries)}
        `;
        })
        .join('');
  }

  // ---------- MODAL ----------
  function openModal(title, innerHTML) {
    modalRoot.innerHTML = `
      <div class="modal-overlay" data-action="close-modal-bg">
        <div class="modal-sheet" role="dialog">
          <div class="modal-title-row">
            <h2>${esc(title)}</h2>
            <button class="modal-close" data-action="close-modal">✕</button>
          </div>
          ${innerHTML}
        </div>
      </div>
    `;
  }
  function closeModal() {
    modalRoot.innerHTML = '';
  }

  function manageExercisesModal() {
    openModal(
      'Manage exercises',
      `
      <div class="field">
        <label>Add new exercise</label>
        <div class="row">
          <input id="newExName" type="text" placeholder="Exercise name" />
          <input id="newExMuscle" type="text" placeholder="Muscle group" />
        </div>
        <select id="newExType" style="margin-top:8px;width:100%;">
          <option value="strength">Strength (weight × reps)</option>
          <option value="cardio">Cardio (time / incline / speed)</option>
        </select>
        <button class="btn secondary" id="addExBtn" style="margin-top:10px;">Add exercise</button>
      </div>
      <div id="exerciseListWrap"></div>
    `
    );
    renderExerciseListWrap();
    document.getElementById('addExBtn').addEventListener('click', () => {
      const name = document.getElementById('newExName').value.trim();
      const muscle = document.getElementById('newExMuscle').value.trim();
      const type = document.getElementById('newExType').value;
      if (!name) return;
      DB.addExercise(name, muscle, type);
      document.getElementById('newExName').value = '';
      document.getElementById('newExMuscle').value = '';
      renderExerciseListWrap();
      render();
    });
  }
  function renderExerciseListWrap() {
    const wrap = document.getElementById('exerciseListWrap');
    if (!wrap) return;
    const exs = DB.state.exercises.slice().sort((a, b) => a.name.localeCompare(b.name));
    wrap.innerHTML = `<div class="card">${exs
      .map(
        (e) => `
      <div class="list-item">
        <div><div>${esc(e.name)}</div><div class="meta">${esc(e.muscle || '')}${e.type === 'cardio' ? ' • Cardio' : ''}</div></div>
        <div class="actions"><button data-action="delete-exercise" data-id="${e.id}">🗑</button></div>
      </div>`
      )
      .join('')}</div>`;
    wrap.querySelectorAll('[data-action="delete-exercise"]').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (!confirm('Delete this exercise? Its logs and plan entries will be removed too.')) return;
        DB.deleteExercise(btn.dataset.id);
        renderExerciseListWrap();
        render();
      })
    );
  }

  function settingsModal() {
    openModal(
      'Settings',
      `
      <div class="field">
        <label>Weight unit</label>
        <select id="unitSelect">
          <option value="lbs" ${unit() === 'lbs' ? 'selected' : ''}>lbs</option>
          <option value="kg" ${unit() === 'kg' ? 'selected' : ''}>kg</option>
        </select>
      </div>
      <div class="field">
        <label>Backups</label>
        <div class="meta" id="backupStatus">${
          lastBackupInfo().never
            ? "You haven't exported a backup yet."
            : `Last backup: ${lastBackupInfo().days === 0 ? 'today' : lastBackupInfo().days + ' day(s) ago'}.`
        }</div>
      </div>
      <button class="btn secondary" id="exportBtn" style="margin-bottom:8px;">Export data (JSON)</button>
      <div class="field">
        <label>Import data (JSON file)</label>
        <input type="file" id="importFile" accept="application/json" />
      </div>
    `
    );
    document.getElementById('unitSelect').addEventListener('change', (e) => {
      DB.setUnit(e.target.value);
      render();
    });
    document.getElementById('exportBtn').addEventListener('click', () => {
      doExport();
      const statusEl = document.getElementById('backupStatus');
      if (statusEl) statusEl.textContent = 'Last backup: today.';
    });
    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          DB.importJSON(reader.result);
          closeModal();
          render();
        } catch (err) {
          alert('Could not read that file.');
        }
      };
      reader.readAsText(file);
    });
  }

  // ---------- EVENTS ----------
  tabBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      render();
    })
  );

  document.getElementById('settingsBtn').addEventListener('click', settingsModal);

  view.addEventListener('change', (e) => {
    if (e.target.id === 'exerciseSelect') {
      logDraft.exerciseId = e.target.value;
      setDraftDefaultsForExercise(logDraft.exerciseId);
      renderLog();
    } else if (e.target.id === 'logDateInput') {
      logDraft.date = e.target.value || todayISO();
      renderLog();
    } else if (e.target.id === 'progressExerciseSelect') {
      progressExerciseId = e.target.value;
      renderProgress();
    }
  });

  view.addEventListener('input', (e) => {
    const field = e.target.dataset.setField;
    if (field) {
      const idx = Number(e.target.dataset.idx);
      logDraft.sets[idx][field] = e.target.value;
    }
  });

  view.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'add-set') {
      const type = exerciseType(logDraft.exerciseId);
      const last = logDraft.sets.at(-1) || {};
      const next = {};
      fieldsForType(type).forEach((f) => (next[f.key] = last[f.key] || ''));
      logDraft.sets.push(next);
      renderSetsInto(document.getElementById('setsContainer'));
    } else if (action === 'remove-set') {
      logDraft.sets.splice(Number(btn.dataset.idx), 1);
      renderSetsInto(document.getElementById('setsContainer'));
    } else if (action === 'save-log') {
      if (!logDraft.exerciseId) {
        alert('Pick an exercise first.');
        return;
      }
      const validSets = logDraft.sets.filter((s) => Object.values(s).some((v) => v !== ''));
      if (!validSets.length) {
        alert('Add at least one set.');
        return;
      }
      DB.addLog(logDraft.exerciseId, validSets, null, logDraft.date);
      const type = exerciseType(logDraft.exerciseId);
      logDraft = { exerciseId: logDraft.exerciseId, sets: [emptySet(type)], date: logDraft.date };
      setDraftDefaultsForExercise(logDraft.exerciseId);
      renderLog();
    } else if (action === 'delete-log') {
      DB.deleteLog(btn.dataset.id);
      render();
    } else if (action === 'edit-log') {
      const log = DB.state.logs.find((l) => l.id === btn.dataset.id);
      if (log) editLogModal(log);
    } else if (action === 'manage-exercises') {
      manageExercisesModal();
    } else if (action === 'pick-plan-exercise') {
      const plan = DB.planById(btn.dataset.plan);
      if (!plan || !plan.exerciseIds.length) return;
      openPlanExercisePicker(plan);
    } else if (action === 'new-plan') {
      planFormModal(null);
    } else if (action === 'edit-plan') {
      planFormModal(DB.planById(btn.dataset.id));
    } else if (action === 'delete-plan') {
      if (confirm('Delete this plan?')) {
        DB.deletePlan(btn.dataset.id);
        render();
      }
    } else if (action === 'backup-now') {
      doExport();
      render();
    } else if (action === 'dismiss-backup') {
      dismissBackupBanner();
      render();
    } else if (action === 'save-weight') {
      const dateEl = document.getElementById('weightDateInput');
      const valEl = document.getElementById('weightValueInput');
      const val = valEl ? valEl.value : '';
      if (!val) {
        alert('Enter a weight first.');
        return;
      }
      DB.addBodyWeight(dateEl && dateEl.value ? dateEl.value : todayISO(), val);
      renderWeight();
    } else if (action === 'delete-weight') {
      DB.deleteBodyWeight(btn.dataset.id);
      renderWeight();
    }
  });

  function openPlanExercisePicker(plan) {
    openModal(
      plan.name,
      `<div class="card">${plan.exerciseIds
        .map((id) => {
          const ex = DB.exerciseById(id);
          if (!ex) return '';
          return `<div class="list-item"><div>${esc(ex.name)}</div><button class="btn small" data-pick-exercise="${ex.id}">Log</button></div>`;
        })
        .join('')}</div>`
    );
    modalRoot.querySelectorAll('[data-pick-exercise]').forEach((b) =>
      b.addEventListener('click', () => {
        logDraft.exerciseId = b.dataset.pickExercise;
        setDraftDefaultsForExercise(logDraft.exerciseId);
        closeModal();
        renderLog();
      })
    );
  }

  modalRoot.addEventListener('click', (e) => {
    if (e.target.dataset.action === 'close-modal' || e.target.dataset.action === 'close-modal-bg') {
      closeModal();
    }
  });

  // Register service worker for offline/installable support, and let the
  // user know (without ever touching their saved data) when a new version
  // of the app has finished downloading in the background.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        // Check for a newer sw.js whenever the app is brought back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      }).catch(() => {});
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      showUpdateToast();
    });
  }

  function showUpdateToast() {
    if (document.getElementById('updateToast')) return;
    const el = document.createElement('div');
    el.id = 'updateToast';
    el.className = 'update-toast';
    el.textContent = '⬆️ Update ready — tap to refresh';
    el.addEventListener('click', () => window.location.reload());
    document.body.appendChild(el);
  }

  render();
})();

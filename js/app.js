(() => {
  const view = document.getElementById('view');
  const modalRoot = document.getElementById('modalRoot');
  const tabBtns = document.querySelectorAll('.tab-btn');

  let currentTab = 'log';
  let progressExerciseId = null;

  // Draft state for the "add a set of logs" form on the Log tab.
  let logDraft = { exerciseId: '', planExerciseIds: null, sets: [{ weight: '', reps: '' }] };

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
  function setDraftDefaultsForExercise(exId) {
    const lastLog = DB.logsForExercise(exId).slice(-1)[0];
    if (lastLog) {
      logDraft.sets = lastLog.sets.map((s) => ({ weight: String(s.weight), reps: String(s.reps) }));
    } else {
      logDraft.sets = [{ weight: '', reps: '' }];
    }
  }

  function render() {
    tabBtns.forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
    if (currentTab === 'log') renderLog();
    else if (currentTab === 'plans') renderPlans();
    else if (currentTab === 'progress') renderProgress();
    else if (currentTab === 'history') renderHistory();
  }

  // ---------- LOG TAB ----------
  function renderLog() {
    const todays = DB.logsOnDay(todayISO());
    view.innerHTML = `
      <h2>Log a workout</h2>
      <div class="card">
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
        <h3>Today${todays.length ? '' : ' — nothing logged yet'}</h3>
        ${todays.length ? renderLogEntries(todays) : ''}
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
    container.innerHTML = logDraft.sets
      .map(
        (s, i) => `
      <div class="set-row">
        <span class="set-idx">${i + 1}</span>
        <input type="number" inputmode="decimal" placeholder="weight (${unit()})" data-set-field="weight" data-idx="${i}" value="${esc(s.weight)}" />
        <span class="x">×</span>
        <input type="number" inputmode="numeric" placeholder="reps" data-set-field="reps" data-idx="${i}" value="${esc(s.reps)}" />
        ${logDraft.sets.length > 1 ? `<button class="remove-set" data-action="remove-set" data-idx="${i}">✕</button>` : ''}
      </div>`
      )
      .join('');
  }

  function renderLogEntries(entries) {
    return `<div class="card">${entries
      .slice()
      .reverse()
      .map((l) => {
        const ex = DB.exerciseById(l.exerciseId);
        const setsStr = l.sets.map((s) => `${s.weight}${unit()}×${s.reps}`).join(', ');
        return `
        <div class="list-item">
          <div>
            <div>${esc(ex ? ex.name : 'Unknown exercise')}</div>
            <div class="meta">${esc(setsStr)}</div>
          </div>
          <div class="actions">
            <button data-action="delete-log" data-id="${l.id}" aria-label="Delete">🗑</button>
          </div>
        </div>`;
      })
      .join('')}</div>`;
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
    const logs = progressExerciseId ? DB.logsForExercise(progressExerciseId) : [];

    let maxWeight = 0,
      totalSessions = logs.length,
      lastDate = '—';
    logs.forEach((l) => l.sets.forEach((s) => (maxWeight = Math.max(maxWeight, s.weight))));
    if (logs.length) lastDate = fmtDate(logs[logs.length - 1].date);

    view.innerHTML = `
      <h2>Progress</h2>
      <div class="field">
        <select id="progressExerciseSelect">${exerciseOptions(progressExerciseId)}</select>
      </div>

      <div class="stat-grid">
        <div class="stat-box"><div class="val">${maxWeight || '—'}</div><div class="lbl">MAX ${unit().toUpperCase()}</div></div>
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
                  const best = l.sets.reduce((m, s) => Math.max(m, s.weight), 0);
                  const setsStr = l.sets.map((s) => `${s.weight}×${s.reps}`).join(', ');
                  return `<div class="list-item"><div><div>${fmtDate(l.date)}</div><div class="meta">${esc(setsStr)}</div></div><div class="meta">best ${best}${unit()}</div></div>`;
                })
                .join('')}</div>`
            : '<div class="empty-state">No history for this exercise yet.</div>'
        }
      </div>
    `;

    drawChart(logs);
  }

  function drawChart(logs) {
    const canvas = document.getElementById('progressChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (logs.length < 1) {
      ctx.fillStyle = '#7d8390';
      ctx.font = '13px sans-serif';
      ctx.fillText('No data yet', 16, h / 2);
      return;
    }
    const points = logs.map((l) => Math.max(...l.sets.map((s) => s.weight)));
    const padding = 24;
    const maxY = Math.max(...points, 1);
    const minY = Math.min(...points, 0);
    const range = maxY - minY || 1;
    const stepX = points.length > 1 ? (w - padding * 2) / (points.length - 1) : 0;

    ctx.strokeStyle = '#2b2f3a';
    ctx.beginPath();
    ctx.moveTo(padding, h - padding);
    ctx.lineTo(w - padding, h - padding);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#4fd1c5';
    ctx.lineWidth = 2;
    points.forEach((p, i) => {
      const x = padding + stepX * i;
      const y = h - padding - ((p - minY) / range) * (h - padding * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#4fd1c5';
    points.forEach((p, i) => {
      const x = padding + stepX * i;
      const y = h - padding - ((p - minY) / range) * (h - padding * 2);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#97a0b0';
    ctx.font = '11px sans-serif';
    ctx.fillText(String(maxY), 4, padding);
    ctx.fillText(String(minY), 4, h - padding + 4);
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
        <button class="btn secondary" id="addExBtn" style="margin-top:8px;">Add exercise</button>
      </div>
      <div id="exerciseListWrap"></div>
    `
    );
    renderExerciseListWrap();
    document.getElementById('addExBtn').addEventListener('click', () => {
      const name = document.getElementById('newExName').value.trim();
      const muscle = document.getElementById('newExMuscle').value.trim();
      if (!name) return;
      DB.addExercise(name, muscle);
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
        <div><div>${esc(e.name)}</div><div class="meta">${esc(e.muscle || '')}</div></div>
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
      const blob = new Blob([DB.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workout-data-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
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
      logDraft.sets.push({ weight: logDraft.sets.at(-1)?.weight || '', reps: logDraft.sets.at(-1)?.reps || '' });
      renderSetsInto(document.getElementById('setsContainer'));
    } else if (action === 'remove-set') {
      logDraft.sets.splice(Number(btn.dataset.idx), 1);
      renderSetsInto(document.getElementById('setsContainer'));
    } else if (action === 'save-log') {
      if (!logDraft.exerciseId) {
        alert('Pick an exercise first.');
        return;
      }
      const validSets = logDraft.sets.filter((s) => s.weight !== '' || s.reps !== '');
      if (!validSets.length) {
        alert('Add at least one set.');
        return;
      }
      DB.addLog(logDraft.exerciseId, validSets);
      logDraft = { exerciseId: logDraft.exerciseId, sets: [{ weight: '', reps: '' }] };
      setDraftDefaultsForExercise(logDraft.exerciseId);
      renderLog();
    } else if (action === 'delete-log') {
      DB.deleteLog(btn.dataset.id);
      render();
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

  // Register service worker for offline/installable support.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  render();
})();

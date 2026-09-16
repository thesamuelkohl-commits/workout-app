/* Storage layer: everything lives in localStorage under one key. */
const DB = (() => {
  const KEY = 'workoutTrackerData_v2';

  // type: 'strength' (weight x reps), 'cardio' (time / incline / speed),
  // or 'timed' (sets x hold time, e.g. planks — no weight or reps)
  const DEFAULT_EXERCISES = [
    { name: 'Leg Press', muscle: 'Legs', type: 'strength' },
    { name: 'Hip Thrust', muscle: 'Glutes', type: 'strength' },
    { name: 'Bulgarian Split Squat', muscle: 'Legs', type: 'strength' },
    { name: 'Hip Abductor', muscle: 'Glutes', type: 'strength' },
    { name: 'Cable Kickbacks', muscle: 'Glutes', type: 'strength' },
    { name: 'Lat Pulldown', muscle: 'Back', type: 'strength' },
    { name: 'Seated Cable Row', muscle: 'Back', type: 'strength' },
    { name: 'Incline Press', muscle: 'Chest', type: 'strength' },
    { name: 'Shoulder Press', muscle: 'Shoulders', type: 'strength' },
    { name: 'Bicep Curl', muscle: 'Arms', type: 'strength' },
    { name: 'Tricep Pushdown', muscle: 'Arms', type: 'strength' },
    { name: 'Romanian Deadlift', muscle: 'Legs', type: 'strength' },
    { name: 'Seated Leg Curl', muscle: 'Legs', type: 'strength' },
    { name: 'Leg Extension', muscle: 'Legs', type: 'strength' },
    { name: 'Step Up', muscle: 'Legs', type: 'strength' },
    { name: 'Walking Lunges', muscle: 'Legs', type: 'strength' },
    { name: 'Abs', muscle: 'Core', type: 'strength' },
    { name: 'Plank', muscle: 'Core', type: 'timed' },
    { name: 'Cable Crunch', muscle: 'Core', type: 'strength' },
    { name: 'Pallof Press', muscle: 'Core', type: 'strength' },
    { name: '45 Degree Back Extension', muscle: 'Back', type: 'strength' },
    { name: 'Treadmill', muscle: 'Cardio', type: 'cardio' },
    { name: 'Goblet Squat', muscle: 'Legs', type: 'strength' },
    { name: 'Rows', muscle: 'Back', type: 'strength' },
    { name: 'Glute Bridges', muscle: 'Glutes', type: 'strength' },
  ];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Exercise names are compared loosely when looking for duplicates: case
  // and runs of whitespace shouldn't make "Back Extension" and "back
  // extension" look like two different exercises.
  function nameKey(name) {
    return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function countLogs(exerciseId) {
    return state.logs.filter((l) => l.exerciseId === exerciseId).length;
  }

  // Local calendar date as YYYY-MM-DD. Deliberately NOT toISOString(), which
  // is UTC and rolls over to the next day while it's still "today" locally
  // for anyone west of UTC (e.g. logging an evening workout in the US).
  function localISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function seed() {
    return {
      exercises: DEFAULT_EXERCISES.map((e) => ({ id: uid(), ...e })),
      plans: [],
      logs: [],
      bodyWeights: [],
      settings: { unit: 'lbs' },
    };
  }

  // Adds any built-in default exercises the user doesn't already have
  // (matched by name, case-insensitive), so new defaults introduced in an
  // app update show up for existing installs without touching their data.
  function fillMissingDefaults(data) {
    const existingNames = new Set(data.exercises.map((e) => e.name.trim().toLowerCase()));
    DEFAULT_EXERCISES.forEach((def) => {
      if (!existingNames.has(def.name.toLowerCase())) {
        data.exercises.push({ id: uid(), ...def });
      }
    });
    return data;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const data = seed();
        save(data);
        return data;
      }
      const data = JSON.parse(raw);
      data.exercises = (data.exercises || []).map((e) => ({ type: 'strength', ...e }));
      data.plans = data.plans || [];
      data.logs = data.logs || [];
      data.bodyWeights = data.bodyWeights || [];
      data.settings = data.settings || { unit: 'lbs' };
      fillMissingDefaults(data);
      save(data);
      return data;
    } catch (e) {
      console.error('Failed to load data, resetting.', e);
      const data = seed();
      save(data);
      return data;
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  let state = load();

  function persist() {
    save(state);
  }

  return {
    uid,
    get state() {
      return state;
    },

    // Exercises
    // Returns { exercise, created }. A name that already exists is NOT added
    // again: a second entry with the same name splits that exercise's history
    // across two ids, and nothing in the Progress tab can see across the split.
    addExercise(name, muscle, type) {
      const validType = type === 'cardio' || type === 'timed' ? type : 'strength';
      const existing = state.exercises.find((e) => nameKey(e.name) === nameKey(name));
      if (existing) return { exercise: existing, created: false };
      const ex = { id: uid(), name: name.trim(), muscle: (muscle || '').trim(), type: validType };
      state.exercises.push(ex);
      persist();
      return { exercise: ex, created: true };
    },
    updateExercise(id, fields) {
      const ex = state.exercises.find((e) => e.id === id);
      if (ex) Object.assign(ex, fields);
      persist();
    },
    deleteExercise(id) {
      state.exercises = state.exercises.filter((e) => e.id !== id);
      state.plans.forEach((p) => (p.exerciseIds = p.exerciseIds.filter((eid) => eid !== id)));
      state.logs = state.logs.filter((l) => l.exerciseId !== id);
      persist();
    },

    // Plans
    addPlan(name, exerciseIds) {
      const plan = { id: uid(), name: name.trim(), exerciseIds: exerciseIds || [] };
      state.plans.push(plan);
      persist();
      return plan;
    },
    updatePlan(id, fields) {
      const plan = state.plans.find((p) => p.id === id);
      if (plan) Object.assign(plan, fields);
      persist();
    },
    deletePlan(id) {
      state.plans = state.plans.filter((p) => p.id !== id);
      persist();
    },

    // Logs. A log entry = one exercise performed on one date with N sets.
    // Sets are stored generically: strength sets look like {weight, reps},
    // cardio sets look like {time, incline, speed}. Whatever keys are passed
    // in are coerced to numbers and kept as-is.
    addLog(exerciseId, sets, planId, dateISO) {
      const entry = {
        id: uid(),
        date: dateISO || localISODate(new Date()),
        exerciseId,
        planId: planId || null,
        sets: sets.map((s) => {
          const out = {};
          Object.keys(s).forEach((k) => (out[k] = Number(s[k]) || 0));
          return out;
        }),
      };
      state.logs.push(entry);
      persist();
      return entry;
    },
    updateLog(id, fields) {
      const log = state.logs.find((l) => l.id === id);
      if (log) Object.assign(log, fields);
      persist();
    },
    deleteLog(id) {
      state.logs = state.logs.filter((l) => l.id !== id);
      persist();
    },

    // Body weight. One entry per calendar day; logging again on the same
    // day overwrites that day's value instead of creating a duplicate.
    addBodyWeight(dateISO, weight) {
      const dateStr = (dateISO || localISODate(new Date())).slice(0, 10);
      const w = Number(weight) || 0;
      const existing = state.bodyWeights.find((b) => b.date.slice(0, 10) === dateStr);
      if (existing) {
        existing.weight = w;
      } else {
        state.bodyWeights.push({ id: uid(), date: dateStr, weight: w });
      }
      persist();
    },
    deleteBodyWeight(id) {
      state.bodyWeights = state.bodyWeights.filter((b) => b.id !== id);
      persist();
    },
    bodyWeightsSorted() {
      return state.bodyWeights
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    },

    // Settings
    setUnit(unit) {
      state.settings.unit = unit;
      persist();
    },

    // Derived helpers
    exerciseById(id) {
      return state.exercises.find((e) => e.id === id);
    },
    planById(id) {
      return state.plans.find((p) => p.id === id);
    },
    logsForExercise(exerciseId) {
      return state.logs
        .filter((l) => l.exerciseId === exerciseId)
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    },
    logsOnDay(dateStr) {
      return state.logs.filter((l) => l.date.slice(0, 10) === dateStr);
    },
    allDays() {
      const days = new Set(state.logs.map((l) => l.date.slice(0, 10)));
      return Array.from(days).sort((a, b) => (a < b ? 1 : -1));
    },
    // ---- Data repair ----
    // Two exercises sharing a name silently split one exercise's history in
    // two. Returns groups of 2+ such exercises, each ordered with the
    // most-logged entry first, since that's the sensible thing to merge into.
    duplicateExerciseGroups() {
      const byName = new Map();
      state.exercises.forEach((e) => {
        const key = nameKey(e.name);
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(e);
      });
      return Array.from(byName.values())
        .filter((group) => group.length > 1)
        .map((group) => group.slice().sort((a, b) => countLogs(b.id) - countLogs(a.id)));
    },

    // Logs whose exercise no longer exists. History renders these as
    // "Unknown exercise", but the Progress tab can't reach them at all,
    // so they look like history that silently disappeared.
    orphanedLogs() {
      const ids = new Set(state.exercises.map((e) => e.id));
      return state.logs.filter((l) => !ids.has(l.exerciseId));
    },

    // Moves every log and plan slot from one exercise onto another, then
    // drops the now-empty source exercise.
    mergeExercises(fromId, toId) {
      if (fromId === toId) return 0;
      let moved = 0;
      state.logs.forEach((l) => {
        if (l.exerciseId === fromId) {
          l.exerciseId = toId;
          moved++;
        }
      });
      state.plans.forEach((p) => {
        const mapped = (p.exerciseIds || []).map((id) => (id === fromId ? toId : id));
        p.exerciseIds = mapped.filter((id, i, arr) => arr.indexOf(id) === i);
      });
      state.exercises = state.exercises.filter((e) => e.id !== fromId);
      persist();
      return moved;
    },

    // Points orphaned logs back at a real exercise so their history shows up
    // in Progress again. Returns how many were reattached.
    reassignOrphanedLogs(toId) {
      const ids = new Set(state.exercises.map((e) => e.id));
      let moved = 0;
      state.logs.forEach((l) => {
        if (!ids.has(l.exerciseId)) {
          l.exerciseId = toId;
          moved++;
        }
      });
      persist();
      return moved;
    },

    exportJSON() {
      return JSON.stringify(state, null, 2);
    },
    importJSON(json) {
      const data = JSON.parse(json);
      state = data;
      persist();
    },
  };
})();

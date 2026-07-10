/* Storage layer: everything lives in localStorage under one key. */
const DB = (() => {
  const KEY = 'workoutTrackerData_v2';

  // type: 'strength' (weight x reps) or 'cardio' (time / incline / speed)
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
    { name: 'Treadmill', muscle: 'Cardio', type: 'cardio' },
    { name: 'Goblet Squat', muscle: 'Legs', type: 'strength' },
    { name: 'Rows', muscle: 'Back', type: 'strength' },
    { name: 'Glute Bridges', muscle: 'Glutes', type: 'strength' },
  ];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
    addExercise(name, muscle, type) {
      const ex = { id: uid(), name: name.trim(), muscle: (muscle || '').trim(), type: type === 'cardio' ? 'cardio' : 'strength' };
      state.exercises.push(ex);
      persist();
      return ex;
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
        date: dateISO || new Date().toISOString(),
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
      const dateStr = (dateISO || new Date().toISOString()).slice(0, 10);
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

/* Storage layer: everything lives in localStorage under one key. */
const DB = (() => {
  const KEY = 'workoutTrackerData_v1';

  const DEFAULT_EXERCISES = [
    { name: 'Bench Press', muscle: 'Chest' },
    { name: 'Squat', muscle: 'Legs' },
    { name: 'Deadlift', muscle: 'Back' },
    { name: 'Overhead Press', muscle: 'Shoulders' },
    { name: 'Barbell Row', muscle: 'Back' },
    { name: 'Pull-up', muscle: 'Back' },
    { name: 'Bicep Curl', muscle: 'Arms' },
    { name: 'Lat Pulldown', muscle: 'Back' },
    { name: 'Leg Press', muscle: 'Legs' },
    { name: 'Plank', muscle: 'Core' },
  ];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function seed() {
    return {
      exercises: DEFAULT_EXERCISES.map((e) => ({ id: uid(), ...e })),
      plans: [],
      logs: [],
      settings: { unit: 'lbs' },
    };
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
      data.exercises = data.exercises || [];
      data.plans = data.plans || [];
      data.logs = data.logs || [];
      data.settings = data.settings || { unit: 'lbs' };
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
    addExercise(name, muscle) {
      const ex = { id: uid(), name: name.trim(), muscle: (muscle || '').trim() };
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
    addLog(exerciseId, sets, planId, dateISO) {
      const entry = {
        id: uid(),
        date: dateISO || new Date().toISOString(),
        exerciseId,
        planId: planId || null,
        sets: sets.map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 })),
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

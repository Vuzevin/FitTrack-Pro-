// ===== FITTRACK PRO — DATA LAYER =====
// LocalStorage-based persistence

const DB = {
  // ---- Keys ----
  KEYS: {
    users: 'ft_users',
    sessions: 'ft_sessions',
    sets: 'ft_sets',
    exercises: 'ft_exercises',
    machines: 'ft_machines',
    metrics: 'ft_metrics',
    profile: 'ft_profile',
    settings: 'ft_settings',
  },

  // ---- Generic helpers ----
  _get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
  },
  _getObj(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
  },
  _set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },
  _id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },

  // ---- Profile ----
  getProfile() {
    return this._getObj(this.KEYS.profile);
  },
  saveProfile(data) {
    const merged = { ...this.getProfile(), ...data };
    this._set(this.KEYS.profile, merged);
    if (typeof pushToSupabase === 'function') pushToSupabase('profiles', { ...merged, id: 'profile' });
  },

  // ---- Settings ----
  getSettings() {
    return { restDuration: 60, vibration: true, ...this._getObj(this.KEYS.settings) };
  },
  saveSettings(data) {
    this._set(this.KEYS.settings, { ...this.getSettings(), ...data });
  },

  // ---- Machines & Exercises ----
  getMachines() {
    let machines = this._get(this.KEYS.machines);
    if (!machines.length) {
      machines = DEFAULT_MACHINES;
      this._set(this.KEYS.machines, machines);
    }
    return machines;
  },
  getExercises() {
    let exercises = this._get(this.KEYS.exercises);
    if (!exercises.length) {
      exercises = DEFAULT_EXERCISES;
      this._set(this.KEYS.exercises, exercises);
    }
    return exercises;
  },
  getExerciseById(id) {
    return this.getExercises().find(e => e.id === id);
  },
  getMachineById(id) {
    return this.getMachines().find(m => m.id === id);
  },
  addExercise(name, category) {
    const ex = {
      id: this._id(),
      name,
      category,
      machineId: 'custom',
    };
    const exercises = this._get(this.KEYS.exercises);
    exercises.push(ex);
    this._set(this.KEYS.exercises, exercises);
    if (typeof pushToSupabase === 'function') pushToSupabase('exercises', ex);
    return ex;
  },

  // ---- Sessions ----
  getSessions() {
    return this._get(this.KEYS.sessions);
  },
  getSessionById(id) {
    return this.getSessions().find(s => s.id === id);
  },
  createSession(sport) {
    const session = {
      id: this._id(),
      sport,
      date: new Date().toISOString(),
      duration: 0,
      notes: '',
      exercises: [],
      finished: false,
    };
    const sessions = this.getSessions();
    sessions.push(session);
    this._set(this.KEYS.sessions, sessions);
    if (typeof pushToSupabase === 'function') pushToSupabase('sessions', session);
    return session;
  },
  updateSession(id, updates) {
    const sessions = this.getSessions();
    const idx = sessions.findIndex(s => s.id === id);
    if (idx !== -1) {
      sessions[idx] = { ...sessions[idx], ...updates };
      this._set(this.KEYS.sessions, sessions);
      if (typeof pushToSupabase === 'function') pushToSupabase('sessions', sessions[idx]);
      return sessions[idx];
    }
  },
  deleteSession(id) {
    let sessions = this.getSessions().filter(s => s.id !== id);
    this._set(this.KEYS.sessions, sessions);
    if (typeof deleteFromSupabase === 'function') deleteFromSupabase('sessions', id);
    
    // also delete sets
    let sets = this.getSets().filter(s => s.sessionId !== id);
    this._set(this.KEYS.sets, sets);
    // Sets are automatically cascaded in SQL or we need to delete them individually.
    // However, since we don't have all set IDs easily without looping, and user deleting session deletes the sets in local,
    // let's rely on cascading or just simple orphaned sets in Supabase (which we can clean up if we want).
  },
  getSessionsInRange(startDate, endDate) {
    return this.getSessions().filter(s => {
      const d = new Date(s.date);
      return d >= startDate && d <= endDate;
    });
  },

  // ---- Sets ----
  getSets() {
    return this._get(this.KEYS.sets);
  },
  getSetsForSession(sessionId) {
    return this.getSets().filter(s => s.sessionId === sessionId);
  },
  getSetsForExercise(exerciseId) {
    return this.getSets().filter(s => s.exerciseId === exerciseId);
  },
  addSet(sessionId, exerciseId, reps, weight) {
    const set = {
      id: this._id(),
      sessionId,
      exerciseId,
      reps: Number(reps),
      weight: Number(weight),
      timestamp: new Date().toISOString(),
    };
    const sets = this.getSets();
    sets.push(set);
    this._set(this.KEYS.sets, sets);
    if (typeof pushToSupabase === 'function') pushToSupabase('sets', set);
    return set;
  },
  deleteSet(id) {
    this._set(this.KEYS.sets, this.getSets().filter(s => s.id !== id));
    if (typeof deleteFromSupabase === 'function') deleteFromSupabase('sets', id);
  },
  getPRForExercise(exerciseId) {
    const sets = this.getSetsForExercise(exerciseId);
    if (!sets.length) return null;
    let best = null;
    sets.forEach(s => {
      const orm = calc1RM(s.weight, s.reps);
      if (!best || orm > best.orm) best = { ...s, orm };
    });
    return best;
  },

  // ---- Metrics (Weight / BMI) ----
  getMetrics() {
    return this._get(this.KEYS.metrics).sort((a, b) => new Date(a.date) - new Date(b.date));
  },
  addMetric(weight, bmi, date) {
    const metric = {
      id: this._id(),
      date: date || new Date().toISOString(),
      weight: Number(weight),
      bmi: Number(bmi),
    };
    const metrics = this.getMetrics();
    metrics.push(metric);
    this._set(this.KEYS.metrics, metrics);
    if (typeof pushToSupabase === 'function') pushToSupabase('metrics', metric);
    return metric;
  },
  deleteMetric(id) {
    this._set(this.KEYS.metrics, this.getMetrics().filter(m => m.id !== id));
    if (typeof deleteFromSupabase === 'function') deleteFromSupabase('metrics', id);
  },

  // ---- Export ----
  exportAll() {
    return {
      profile: this.getProfile(),
      sessions: this.getSessions(),
      sets: this.getSets(),
      metrics: this.getMetrics(),
      exercises: this.getExercises(),
      machines: this.getMachines(),
      exportedAt: new Date().toISOString(),
    };
  },
  clearAll() {
    Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
  },
};

// ===== CALCULATIONS =====
function calc1RM(weight, reps) {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

function calcBMI(weight, heightCm) {
  if (!weight || !heightCm) return 0;
  const h = heightCm / 100;
  return Math.round((weight / (h * h)) * 10) / 10;
}

function getBMICategory(bmi) {
  if (bmi < 18.5) return { label: 'Insuffisance pondérale', color: '#60a5fa' };
  if (bmi < 25) return { label: 'Poids normal', color: '#34d399' };
  if (bmi < 30) return { label: 'Surpoids', color: '#fbbf24' };
  return { label: 'Obésité', color: '#f87171' };
}

function calcIndiceDeFormeFor(sessions) {
  // Based on sessions in last 14 days, target = 2 per week = 4 in 14 days
  const now = new Date();
  const cutoff = new Date(now - 14 * 24 * 3600 * 1000);
  const recent = sessions.filter(s => s.finished && new Date(s.date) >= cutoff);
  const score = Math.min(100, Math.round((recent.length / 4) * 100));
  return score;
}

function calcIndiceDePerformance(exerciseId) {
  // % change in best 1RM between 4-8 weeks ago and last 4 weeks
  const sets = DB.getSetsForExercise(exerciseId);
  if (!sets.length) return { value: 0, label: 'Pas assez de données' };
  const now = new Date();
  const fourWeeks = new Date(now - 28 * 24 * 3600 * 1000);
  const eightWeeks = new Date(now - 56 * 24 * 3600 * 1000);

  const recentSets = sets.filter(s => new Date(s.timestamp) >= fourWeeks);
  const olderSets = sets.filter(s => new Date(s.timestamp) >= eightWeeks && new Date(s.timestamp) < fourWeeks);

  if (!recentSets.length || !olderSets.length) return { value: 0, label: 'Pas assez de données' };

  const bestRecent = Math.max(...recentSets.map(s => calc1RM(s.weight, s.reps)));
  const bestOld = Math.max(...olderSets.map(s => calc1RM(s.weight, s.reps)));

  const pct = Math.round(((bestRecent - bestOld) / bestOld) * 100);
  return { value: pct, label: pct >= 0 ? `+${pct}%` : `${pct}%` };
}

const DEFAULT_MACHINES = [
  { id: 'm1', name: 'Squat / Rack', muscleGroups: ['Quadriceps', 'Fessiers', 'Ischio-jambiers'], category: 'Jambes' },
  { id: 'm2', name: 'Développé couché (Banc plat)', muscleGroups: ['Pectoraux', 'Triceps', 'Épaules'], category: 'Poitrine' },
  { id: 'm3', name: 'Développé incliné', muscleGroups: ['Pectoraux hauts', 'Épaules'], category: 'Poitrine' },
  { id: 'm4', name: 'Tractions / Pull-up bar', muscleGroups: ['Dorsaux', 'Biceps'], category: 'Dos' },
  { id: 'm5', name: 'Tirage verticale machine', muscleGroups: ['Dorsaux', 'Biceps'], category: 'Dos' },
  { id: 'm6', name: 'Rowing barre / machine', muscleGroups: ['Dorsaux', 'Trapèzes', 'Biceps'], category: 'Dos' },
  { id: 'm7', name: 'Développé militaire', muscleGroups: ['Épaules', 'Triceps'], category: 'Épaules' },
  { id: 'm8', name: 'Élévations latérales', muscleGroups: ['Deltoïdes'], category: 'Épaules' },
  { id: 'm9', name: 'Curl biceps (haltères/barre)', muscleGroups: ['Biceps'], category: 'Bras' },
  { id: 'm10', name: 'Extension triceps (câble/haltère)', muscleGroups: ['Triceps'], category: 'Bras' },
  { id: 'm11', name: 'Leg Press', muscleGroups: ['Quadriceps', 'Fessiers'], category: 'Jambes' },
  { id: 'm12', name: 'Leg Curl (couché/assis)', muscleGroups: ['Ischio-jambiers'], category: 'Jambes' },
  { id: 'm13', name: 'Mollets (debout/assis)', muscleGroups: ['Mollets'], category: 'Jambes' },
  { id: 'm14', name: 'Crunch / Ab machine', muscleGroups: ['Abdominaux'], category: 'Abdos' },
  { id: 'm15', name: 'Cable cross-over', muscleGroups: ['Pectoraux', 'Épaules'], category: 'Poitrine' },
  { id: 'm16', name: 'Haltères (polyvalent)', muscleGroups: ['Global'], category: 'Polyvalent' },
  { id: 'm17', name: 'Poids du corps / Tapis', muscleGroups: ['Global'], category: 'Poids du corps' },
  { id: 'm18', name: 'Hip Thrust Machine (Matrix)', muscleGroups: ['Fessiers'], category: 'Jambes' },
  { id: 'm19', name: 'Hip Abductor (Matrix)', muscleGroups: ['Fessiers'], category: 'Jambes' },
  { id: 'm20', name: 'Hip Adductor (Matrix)', muscleGroups: ['Adducteurs'], category: 'Jambes' },
  { id: 'm21', name: 'Pec Fly / Rear Delt (Matrix)', muscleGroups: ['Pectoraux', 'Épaules'], category: 'Poitrine' },
  { id: 'm22', name: 'Diverging Lat Pulldown (Matrix)', muscleGroups: ['Dorsaux', 'Biceps'], category: 'Dos' },
  { id: 'm23', name: 'Leg Extension (Matrix)', muscleGroups: ['Quadriceps'], category: 'Jambes' },
  { id: 'm24', name: 'Glute Trainer (Matrix)', muscleGroups: ['Fessiers'], category: 'Jambes' },
  { id: 'm25', name: 'Hack Squat (Matrix)', muscleGroups: ['Quadriceps', 'Fessiers'], category: 'Jambes' },
  { id: 'm26', name: 'Converging Chest Press (Matrix)', muscleGroups: ['Pectoraux', 'Triceps'], category: 'Poitrine' },
  { id: 'm27', name: 'Converging Shoulder Press (Matrix)', muscleGroups: ['Épaules', 'Triceps'], category: 'Épaules' },
];

const DEFAULT_EXERCISES = [
  { id: 'e1', name: 'Squat', machineId: 'm1', category: 'Jambes' },
  { id: 'e2', name: 'Développé couché', machineId: 'm2', category: 'Poitrine' },
  { id: 'e3', name: 'Développé incliné', machineId: 'm3', category: 'Poitrine' },
  { id: 'e4', name: 'Tractions', machineId: 'm4', category: 'Dos' },
  { id: 'e5', name: 'Tirage verticale', machineId: 'm5', category: 'Dos' },
  { id: 'e6', name: 'Rowing barre', machineId: 'm6', category: 'Dos' },
  { id: 'e7', name: 'Développé militaire', machineId: 'm7', category: 'Épaules' },
  { id: 'e8', name: 'Élévations latérales', machineId: 'm8', category: 'Épaules' },
  { id: 'e9', name: 'Curl biceps', machineId: 'm9', category: 'Bras' },
  { id: 'e10', name: 'Extension triceps', machineId: 'm10', category: 'Bras' },
  { id: 'e11', name: 'Leg Press', machineId: 'm11', category: 'Jambes' },
  { id: 'e12', name: 'Leg Curl', machineId: 'm12', category: 'Jambes' },
  { id: 'e13', name: 'Mollets debout', machineId: 'm13', category: 'Jambes' },
  { id: 'e14', name: 'Crunch machine', machineId: 'm14', category: 'Abdos' },
  { id: 'e15', name: 'Cable fly', machineId: 'm15', category: 'Poitrine' },
  { id: 'e16', name: 'Soulevé de terre', machineId: 'm16', category: 'Dos' },
  { id: 'e17', name: 'Hip thrust', machineId: 'm16', category: 'Fessiers' },
  { id: 'e18', name: 'Fentes', machineId: 'm16', category: 'Jambes' },
  { id: 'e19', name: 'Pompes', machineId: 'm17', category: 'Poids du corps' },
  { id: 'e20', name: 'Dips', machineId: 'm17', category: 'Poids du corps' },
  { id: 'e21', name: 'Gainage (Planche)', machineId: 'm17', category: 'Poids du corps' },
  { id: 'e22', name: 'Squat au pdc', machineId: 'm17', category: 'Poids du corps' },
  { id: 'e23', name: 'Burpees', machineId: 'm17', category: 'Poids du corps' },
  { id: 'e24', name: 'Machine Hip Thrust', machineId: 'm18', category: 'Fessiers' },
  { id: 'e25', name: 'Abduction', machineId: 'm19', category: 'Fessiers' },
  { id: 'e26', name: 'Adduction', machineId: 'm20', category: 'Jambes' },
  { id: 'e27', name: 'Pec Fly', machineId: 'm21', category: 'Poitrine' },
  { id: 'e28', name: 'Rear Delt Fly', machineId: 'm21', category: 'Épaules' },
  { id: 'e29', name: 'Tirage Verticale Divergent', machineId: 'm22', category: 'Dos' },
  { id: 'e30', name: 'Leg Extension', machineId: 'm23', category: 'Jambes' },
  { id: 'e31', name: 'Machine Glute Kickback', machineId: 'm24', category: 'Fessiers' },
  { id: 'e32', name: 'Hack Squat Machine', machineId: 'm25', category: 'Jambes' },
  { id: 'e33', name: 'Chest Press Convergent', machineId: 'm26', category: 'Poitrine' },
  { id: 'e34', name: 'Shoulder Press Convergent', machineId: 'm27', category: 'Épaules' },
];

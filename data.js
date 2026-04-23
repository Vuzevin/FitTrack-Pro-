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
      startTime: Date.now(),
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
  updateSet(id, updates) {
    const sets = this.getSets();
    const idx = sets.findIndex(s => s.id === id);
    if (idx !== -1) {
      sets[idx] = { ...sets[idx], ...updates };
      this._set(this.KEYS.sets, sets);
      if (typeof pushToSupabase === 'function') pushToSupabase('sets', sets[idx]);
      return sets[idx];
    }
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
  // Enhanced "Indice de Forme" (0-100)
  // Factors: Frequency, Variety, Intensity, Consistency
  const now = new Date();
  const twoWeeksAgo = new Date(now - 14 * 24 * 3600 * 1000);
  const fourWeeksAgo = new Date(now - 28 * 24 * 3600 * 1000);
  
  const recentSessions = sessions.filter(s => s.finished && new Date(s.date) >= twoWeeksAgo);
  if (recentSessions.length === 0) return 0;

  // 1. Frequency (Target: 3 sessions/week = 6 in 14 days)
  const freqScore = Math.min(100, (recentSessions.length / 6) * 100);

  // 2. Variety (Distinct muscle groups targeted in last 14 days)
  const muscleGroups = new Set();
  const allExercises = DB.getExercises();
  const allSets = DB.getSets();
  
  recentSessions.forEach(sess => {
    const sessSets = allSets.filter(st => st.sessionId === sess.id);
    sessSets.forEach(st => {
      const ex = allExercises.find(e => e.id === st.exerciseId);
      if (ex && ex.muscleGroups) ex.muscleGroups.forEach(mg => muscleGroups.add(mg));
    });
  });
  // Reward for hitting at least 6 major groups (Chest, Back, Legs, Shoulders, Arms, Abs)
  const varietyScore = Math.min(100, (muscleGroups.size / 6) * 100);

  // 3. Intensity (Current 2-week volume vs 4-week average)
  const recentSets = allSets.filter(st => {
    const s = sessions.find(sess => sess.id === st.sessionId);
    return s && new Date(s.date) >= twoWeeksAgo;
  });
  const olderSets = allSets.filter(st => {
    const s = sessions.find(sess => sess.id === st.sessionId);
    return s && new Date(s.date) >= fourWeeksAgo && new Date(s.date) < twoWeeksAgo;
  });

  const recentVol = recentSets.reduce((acc, st) => acc + (st.weight * st.reps), 0);
  const olderVol = olderSets.reduce((acc, st) => acc + (st.weight * st.reps), 0) / 2; // adjust for 2-week comparison
  
  let intensityScore = 80; // default for baseline
  if (olderVol > 0) {
    const ratio = recentVol / olderVol;
    intensityScore = Math.min(100, ratio * 80);
  }

  // 4. Consistency (Gap between sessions)
  // Sort by date ascending
  const dates = recentSessions.map(s => new Date(s.date)).sort((a,b) => a - b);
  let gaps = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push((dates[i] - dates[i-1]) / (1000 * 3600 * 24));
  }
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 14;
  // Ideal gap: 1.5 to 3 days
  let consistencyScore = 100;
  if (avgGap > 4) consistencyScore = Math.max(0, 100 - (avgGap - 4) * 10);
  if (avgGap < 1) consistencyScore = 80; // slightly penalize daily sessions without rest

  return Math.round(freqScore * 0.4 + varietyScore * 0.2 + intensityScore * 0.2 + consistencyScore * 0.2);
}

function calcTotalCaloriesForSession(session, sets) {
  // Enhanced Calorie Estimation using MET values
  // Formula: MET * Weight (kg) * Duration (hours)
  const profile = DB.getProfile();
  const weight = profile.weight || 75; // fallback weight
  const durationHr = (session.duration / 3600) || (session.manualDuration / 60) || 0;
  
  if (durationHr <= 0) return 0;

  // Base MET values
  const METS = {
    'muscle': 5.0,
    'bodyweight': 8.0,
    'run': 10.0,
    'cycle': 8.5
  };
  
  let baseMET = METS[session.sport] || 6.0;

  // Heart Rate Factor (if available)
  // Advanced formula if HR is present
  if (session.hr && session.hr > 0) {
    const hr = Number(session.hr);
    const age = Number(profile.age) || 30;
    // Gender could be added to profile, default to average
    // kcal/min = (0.6309 * HR + 0.1988 * Weight + 0.2017 * Age - 55.0969) / 4.184
    const calPerMin = (0.6309 * hr + 0.1988 * weight + 0.2017 * age - 55.0969) / 4.184;
    return Math.round(calPerMin * (durationHr * 60));
  }

  // Volume/Intensity adjustment for strength training
  if (session.sport === 'muscle' && sets && sets.length > 0) {
    baseMET += (sets.length / 5) * 0.5; // Every 5 sets increases intensity
  }

  return Math.round(baseMET * weight * durationHr);
}

function calcIndiceDePerformance(exerciseId) {
  // % change in best 1RM between 4-8 weeks ago and last 4 weeks
  const sets = DB.getSetsForExercise(exerciseId);
  if (!sets.length) return { value: 0, label: 'Pas assez de données' };
  const now = new Date();
  const fourWeeks = new Date(now - 28 * 24 * 3600 * 1000);
  const eightWeeks = new Date(now - 56 * 24 * 3600 * 1000);

  const setsWithDate = sets.map(s => {
    const session = DB.getSessionById(s.sessionId);
    return { ...s, sessionDate: session ? new Date(session.date) : new Date(s.timestamp) };
  });

  const recentSets = setsWithDate.filter(s => s.sessionDate >= fourWeeks);
  const olderSets = setsWithDate.filter(s => s.sessionDate >= eightWeeks && s.sessionDate < fourWeeks);

  if (!recentSets.length || !olderSets.length) return { value: 0, label: 'Pas assez de données' };

  const bestRecent = Math.max(...recentSets.map(s => calc1RM(s.weight, s.reps)));
  const bestOld = Math.max(...olderSets.map(s => calc1RM(s.weight, s.reps)));

  const pct = Math.round(((bestRecent - bestOld) / bestOld) * 100);
  return { value: pct, label: pct >= 0 ? `+${pct}%` : `${pct}%` };
}

function getMuscleRecovery() {
  const sessions = DB.getSessions().filter(s => s.finished);
  const allSets = DB.getSets();
  const exercises = DB.getExercises();
  const now = new Date();
  
  // Standard full recovery time: 48 hours
  const RECOVERY_TIME_MS = 48 * 3600 * 1000;
  
  const recovery = {};
  const majorGroups = ['Pectoraux', 'Dorsaux', 'Épaules', 'Quadriceps', 'Ischio-jambiers', 'Biceps', 'Triceps', 'Abdominaux', 'Fessiers'];
  
  majorGroups.forEach(g => recovery[g] = 100);

  sessions.forEach(sess => {
    const sessSets = allSets.filter(st => st.sessionId === sess.id);
    const msSinceSess = now - new Date(sess.date);
    
    sessSets.forEach(st => {
      const ex = exercises.find(e => e.id === st.exerciseId);
      if (ex && ex.muscleGroups) {
        ex.muscleGroups.forEach(mg => {
          if (recovery[mg] !== undefined) {
            // Decrease recovery based on session recency
            // At sess.date, recovery drops to some value (e.g. 20%)
            // Then it linearly increases to 100% over RECOVERY_TIME_MS
            const currentRec = Math.min(100, (msSinceSess / RECOVERY_TIME_MS) * 100);
            if (currentRec < recovery[mg]) {
              recovery[mg] = Math.round(currentRec);
            }
          }
        });
      }
    });
  });

  return recovery;
}

function calcWeeklyVolumeProgression() {
  const sessions = DB.getSessions().filter(s => s.finished);
  const allSets = DB.getSets();
  const now = new Date();
  
  const oneWeekAgo = new Date(now - 7 * 24 * 3600 * 1000);
  const twoWeeksAgo = new Date(now - 14 * 24 * 3600 * 1000);
  
  const thisWeekSets = allSets.filter(st => {
    const s = sessions.find(sess => sess.id === st.sessionId);
    return s && new Date(s.date) >= oneWeekAgo;
  });
  
  const lastWeekSets = allSets.filter(st => {
    const s = sessions.find(sess => sess.id === st.sessionId);
    return s && new Date(s.date) >= twoWeeksAgo && new Date(s.date) < oneWeekAgo;
  });
  
  const thisWeekVol = thisWeekSets.reduce((acc, st) => acc + (st.weight * st.reps), 0);
  const lastWeekVol = lastWeekSets.reduce((acc, st) => acc + (st.weight * st.reps), 0);
  
  if (lastWeekVol === 0) return thisWeekVol > 0 ? 100 : 0;
  return Math.round(((thisWeekVol - lastWeekVol) / lastWeekVol) * 100);
}

function getRecentPRsCount() {
  const now = new Date();
  const oneWeekAgo = new Date(now - 7 * 24 * 3600 * 1000);
  const allSets = DB.getSets();
  const exercises = DB.getExercises();
  
  let count = 0;
  exercises.forEach(ex => {
    const exSets = allSets.filter(s => s.exerciseId === ex.id);
    if (!exSets.length) return;
    
    let best = 0;
    exSets.forEach(s => {
      const orm = calc1RM(s.weight, s.reps);
      if (orm > best) best = orm;
    });
    
    if (exSets.some(s => calc1RM(s.weight, s.reps) === best && new Date(s.timestamp) >= oneWeekAgo)) {
      count++;
    }
  });
  return count;
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
  { id: 'e1', name: 'Squat', machineId: 'm1', category: 'Jambes', muscleGroups: ['Quadriceps', 'Fessiers', 'Ischio-jambiers'] },
  { id: 'e2', name: 'Développé couché', machineId: 'm2', category: 'Poitrine', muscleGroups: ['Pectoraux', 'Triceps', 'Épaules'] },
  { id: 'e3', name: 'Développé incliné', machineId: 'm3', category: 'Poitrine', muscleGroups: ['Pectoraux hauts', 'Épaules', 'Triceps'] },
  { id: 'e4', name: 'Tractions', machineId: 'm4', category: 'Dos', muscleGroups: ['Dorsaux', 'Biceps', 'Avant-bras'] },
  { id: 'e5', name: 'Tirage verticale', machineId: 'm5', category: 'Dos', muscleGroups: ['Dorsaux', 'Biceps'] },
  { id: 'e6', name: 'Rowing barre', machineId: 'm6', category: 'Dos', muscleGroups: ['Dorsaux', 'Trapèzes', 'Biceps', 'Lombaires'] },
  { id: 'e7', name: 'Développé militaire', machineId: 'm7', category: 'Épaules', muscleGroups: ['Épaules', 'Triceps', 'Haut du dos'] },
  { id: 'e8', name: 'Élévations latérales', machineId: 'm8', category: 'Épaules', muscleGroups: ['Deltoïdes latéraux'] },
  { id: 'e9', name: 'Curl biceps', machineId: 'm9', category: 'Bras', muscleGroups: ['Biceps', 'Avant-bras'] },
  { id: 'e10', name: 'Extension triceps', machineId: 'm10', category: 'Bras', muscleGroups: ['Triceps'] },
  { id: 'e11', name: 'Leg Press', machineId: 'm11', category: 'Jambes', muscleGroups: ['Quadriceps', 'Fessiers'] },
  { id: 'e12', name: 'Leg Curl', machineId: 'm12', category: 'Jambes', muscleGroups: ['Ischio-jambiers'] },
  { id: 'e13', name: 'Mollets debout', machineId: 'm13', category: 'Jambes', muscleGroups: ['Mollets'] },
  { id: 'e14', name: 'Crunch machine', machineId: 'm14', category: 'Abdos', muscleGroups: ['Abdominaux'] },
  { id: 'e15', name: 'Cable fly', machineId: 'm15', category: 'Poitrine', muscleGroups: ['Pectoraux'] },
  { id: 'e16', name: 'Soulevé de terre', machineId: 'm16', category: 'Dos', muscleGroups: ['Lombaires', 'Ischio-jambiers', 'Fessiers', 'Trapèzes'] },
  { id: 'e17', name: 'Hip thrust', machineId: 'm16', category: 'Fessiers', muscleGroups: ['Fessiers', 'Ischio-jambiers'] },
  { id: 'e18', name: 'Fentes', machineId: 'm16', category: 'Jambes', muscleGroups: ['Quadriceps', 'Fessiers', 'Adducteurs'] },
  { id: 'e19', name: 'Pompes', machineId: 'm17', category: 'Poids du corps', muscleGroups: ['Pectoraux', 'Triceps', 'Épaules'] },
  { id: 'e20', name: 'Dips', machineId: 'm17', category: 'Poids du corps', muscleGroups: ['Pectoraux', 'Triceps', 'Épaules'] },
  { id: 'e21', name: 'Gainage (Planche)', machineId: 'm17', category: 'Poids du corps', muscleGroups: ['Abdominaux', 'Lombaires', 'Épaules'] },
  { id: 'e22', name: 'Squat au pdc', machineId: 'm17', category: 'Poids du corps', muscleGroups: ['Quadriceps', 'Fessiers'] },
  { id: 'e23', name: 'Burpees', machineId: 'm17', category: 'Poids du corps', muscleGroups: ['Global', 'Cardio', 'Jambes', 'Pectoraux'] },
  { id: 'e24', name: 'Machine Hip Thrust', machineId: 'm18', category: 'Fessiers', muscleGroups: ['Fessiers'] },
  { id: 'e25', name: 'Abduction', machineId: 'm19', category: 'Fessiers', muscleGroups: ['Fessiers', 'TFL'] },
  { id: 'e26', name: 'Adduction', machineId: 'm20', category: 'Jambes', muscleGroups: ['Adducteurs'] },
  { id: 'e27', name: 'Pec Fly', machineId: 'm21', category: 'Poitrine', muscleGroups: ['Pectoraux'] },
  { id: 'e28', name: 'Rear Delt Fly', machineId: 'm21', category: 'Épaules', muscleGroups: ['Deltoïdes postérieurs', 'Trapèzes'] },
  { id: 'e29', name: 'Tirage Verticale Divergent', machineId: 'm22', category: 'Dos', muscleGroups: ['Dorsaux', 'Biceps'] },
  { id: 'e30', name: 'Leg Extension', machineId: 'm23', category: 'Jambes', muscleGroups: ['Quadriceps'] },
  { id: 'e31', name: 'Machine Glute Kickback', machineId: 'm24', category: 'Fessiers', muscleGroups: ['Fessiers'] },
  { id: 'e32', name: 'Hack Squat Machine', machineId: 'm25', category: 'Jambes', muscleGroups: ['Quadriceps', 'Fessiers'] },
  { id: 'e33', name: 'Chest Press Convergent', machineId: 'm26', category: 'Poitrine', muscleGroups: ['Pectoraux', 'Triceps'] },
  { id: 'e34', name: 'Shoulder Press Convergent', machineId: 'm27', category: 'Épaules', muscleGroups: ['Épaules', 'Triceps'] },
];

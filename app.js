/* ===== FITTRACK PRO — APP.JS ===== */
'use strict';

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let currentView = 'dashboard';
let activeSessionId = null;
let activeSessionSport = null;
let activeExerciseId = null;    // exercise being logged right now
let sessionStartTime = null;
let sessionElapsedMs = 0;
let sessionTimerInterval = null;
let cardioTimerInterval = null;
let cardioRunning = false;
let cardioElapsed = 0;          // seconds
let calCurrentDate = new Date();
let calSelectedDay = null;
let selectedDetailSessionId = null;
let restTimerInterval = null;
let restRemaining = 0;
let restTotal = 0;
let isPastSessionMode = false;

// Chart instances (to destroy before re-draw)
const charts = {};

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  const navEl = document.getElementById('nav-' + view);
  if (el) el.classList.add('active');
  if (navEl) navEl.classList.add('active');
  currentView = view;
  // lifecycle hooks
  if (view === 'dashboard') renderDashboard();
  if (view === 'session') renderSessionView();
  if (view === 'history') renderHistory();
  if (view === 'stats') renderStats();
  if (view === 'health') renderHealth();
  if (view === 'profile') renderProfile();
  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) {
    setTimeout(() => lucide.createIcons(), 10);
  }
}

function startQuickSession(sport) {
  navigate('session');
  selectSport(sport);
}

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
function showToast(msg, type = '') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
function renderDashboard() {
  const now = new Date();
  const profile = DB.getProfile();
  const sessions = DB.getSessions();

  // Date
  document.getElementById('dash-date').textContent =
    now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  // Greeting
  let name = profile.name || '';
  if (!name && window.currentUser && window.currentUser.email) {
    name = window.currentUser.email.split('@')[0];
  }
  const sub = document.getElementById('dashboard-subtitle');
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bonne matinée' : hour < 18 ? 'Bon après-midi' : 'Bonne soirée';
  sub.textContent = name ? `${greeting}, ${name} 💪` : 'Prêt à s\'entraîner ?';

  // Indice de Forme
  const forme = calcIndiceDeFormeFor(sessions);
  document.getElementById('indice-forme').textContent = forme;
  document.getElementById('forme-ring-text').textContent = forme;
  const circ = 2 * Math.PI * 34;
  const offset = circ - (forme / 100) * circ;
  document.getElementById('forme-ring').style.strokeDashoffset = offset;
  const formeDescHtml = forme >= 80 ? '<i data-lucide="flame" style="width:16px;margin-bottom:-3px;"></i> En super forme !' :
    forme >= 50 ? '<i data-lucide="thumbs-up" style="width:16px;margin-bottom:-3px;"></i> Bonne régularité' :
      forme >= 20 ? '<i data-lucide="alert-triangle" style="width:16px;margin-bottom:-3px;"></i> Reprenez le rythme' :
        '<i data-lucide="moon" style="width:16px;margin-bottom:-3px;"></i> Pas de séances récentes';
  document.getElementById('indice-forme-desc').innerHTML = formeDescHtml;

  // KPIs
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthSessions = sessions.filter(s => s.finished && new Date(s.date) >= monthStart);
  document.getElementById('kpi-sessions').textContent = monthSessions.length;

  const allSets = DB.getSets();
  const thisMonthSets = allSets.filter(s => {
    const sess = sessions.find(se => se.id === s.sessionId);
    return sess && new Date(sess.date) >= monthStart;
  });
  const vol = thisMonthSets.reduce((acc, s) => acc + s.weight * s.reps, 0);
  document.getElementById('kpi-volume').textContent = vol >= 1000 ? (vol / 1000).toFixed(1) + 'k' : Math.round(vol);

  // Perf index - use most trained exercise
  const exercises = DB.getExercises();
  let bestPerfExId = null;
  let maxSets = 0;
  exercises.forEach(ex => {
    const cnt = allSets.filter(s => s.exerciseId === ex.id).length;
    if (cnt > maxSets) { maxSets = cnt; bestPerfExId = ex.id; }
  });
  if (bestPerfExId) {
    const perf = calcIndiceDePerformance(bestPerfExId);
    const ex = DB.getExerciseById(bestPerfExId);
    const val = perf.value;
    document.getElementById('kpi-perf').textContent = perf.label;
    const perfTrendEl = document.getElementById('kpi-perf-desc');
    perfTrendEl.textContent = ex ? ex.name : 'meilleur exercice';
    perfTrendEl.className = 'kpi-trend ' + (val > 0 ? 'up' : val < 0 ? 'down' : 'neutral');
  } else {
    document.getElementById('kpi-perf').textContent = '—';
  }

  // Weight
  const metrics = DB.getMetrics();
  if (metrics.length) {
    const last = metrics[metrics.length - 1];
    document.getElementById('kpi-weight').textContent = last.weight;
    if (metrics.length >= 2) {
      const prev = metrics[metrics.length - 2];
      const diff = (last.weight - prev.weight).toFixed(1);
      const el = document.getElementById('kpi-weight-trend');
      el.textContent = (diff > 0 ? '+' : '') + diff + ' kg';
      el.className = 'kpi-trend ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral');
    }
  }

  // Recent sessions
  const recent = sessions.filter(s => s.finished).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const el = document.getElementById('recent-sessions-list');
  if (!recent.length) {
    el.innerHTML = `<div class="empty-state" style="padding:var(--space-lg);">
      <div class="empty-icon"><i data-lucide="clipboard-list"></i></div>
      <div class="empty-title">Aucune séance</div>
      <div class="empty-desc">Commencez votre premier entraînement !</div>
    </div>`;
  } else {
    el.innerHTML = recent.map(s => sessionHistoryCard(s)).join('');
  }

  // Render Exercise Suggestions
  renderExerciseSuggestions(allSets, sessions);
}

function renderExerciseSuggestions(allSets, sessions) {
  const container = document.getElementById('dashboard-suggestions');
  if (!container) return;

  const exercises = DB.getExercises();
  const finishedSessions = sessions.filter(s => s.finished && (s.sport === 'muscle' || s.sport === 'bodyweight'));
  
  if (!finishedSessions.length || !allSets.length) {
    container.innerHTML = `<div class="empty-state" style="padding:var(--space-md); text-align:center;">
      <div class="empty-icon"><i data-lucide="lightbulb" style="width:24px; color:var(--text-muted);"></i></div>
      <div class="empty-desc" style="font-size:13px; margin-top:8px;">Faites quelques séances pour obtenir des conseils !</div>
    </div>`;
    return;
  }

  // 1. Group sets by exercise and compute their last performed date and a performance metric
  const exStats = {};
  allSets.forEach(set => {
    const sess = finishedSessions.find(s => s.id === set.sessionId);
    if (!sess) return;
    const date = new Date(sess.date);
    const orm = calc1RM(set.weight, set.reps);
    
    if (!exStats[set.exerciseId]) {
      exStats[set.exerciseId] = { id: set.exerciseId, logs: [] };
    }
    exStats[set.exerciseId].logs.push({ date, orm });
  });

  const candidates = [];
  const now = new Date();

  Object.values(exStats).forEach(stat => {
    // sort logs by date
    stat.logs.sort((a, b) => a.date - b.date);
    const lastLog = stat.logs[stat.logs.length - 1];
    const daysSince = (now - lastLog.date) / (1000 * 3600 * 24);
    
    // Check if performance dropped recently (compare max of last session to max of session before)
    let dropped = false;
    if (stat.logs.length > 2) {
      const dates = [...new Set(stat.logs.map(l => l.date.toISOString()))].sort();
      if (dates.length >= 2) {
        const lastDateLogs = stat.logs.filter(l => l.date.toISOString() === dates[dates.length - 1]);
        const prevDateLogs = stat.logs.filter(l => l.date.toISOString() === dates[dates.length - 2]);
        const maxLast = Math.max(...lastDateLogs.map(l => l.orm));
        const maxPrev = Math.max(...prevDateLogs.map(l => l.orm));
        if (maxLast < maxPrev * 0.95) dropped = true; // 5% drop
      }
    }

    candidates.push({
      id: stat.id,
      daysSince,
      dropped
    });
  });

  // 2. Select 2 exercises to suggest
  const suggestions = [];
  
  // Rule A: Needs improvement (dropped performance)
  const toImprove = candidates.filter(c => c.dropped).sort((a, b) => b.daysSince - a.daysSince)[0];
  if (toImprove) suggestions.push({ type: 'improve', exId: toImprove.id, reason: 'À améliorer' });

  // Rule B: Hasn't been done in a while (Longest daysSince, min 5 days)
  const availableForB = candidates.filter(c => c.daysSince > 5 && c.id !== (toImprove ? toImprove.id : null));
  if (availableForB.length) {
    availableForB.sort((a, b) => b.daysSince - a.daysSince);
    suggestions.push({ type: 'repeat', exId: availableForB[0].id, reason: `Pas fait depuis ${Math.floor(availableForB[0].daysSince)} jours` });
  }

  // Fallback Rule C: Just random from the least recently done if we still need more
  if (suggestions.length < 2) {
    const remain = candidates
      .filter(c => !suggestions.find(s => s.exId === c.id))
      .sort((a, b) => b.daysSince - a.daysSince);
    if (remain.length) {
      suggestions.push({ type: 'suggested', exId: remain[0].id, reason: `Entretien régulier` });
    }
  }

  if (!suggestions.length) {
    container.innerHTML = `<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:12px;">Continuez comme ça !</div>`;
    return;
  }

  // 3. Render
  container.innerHTML = `<div style="display:flex; flex-direction:column; gap:8px;">` + 
    suggestions.map(s => {
      const ex = DB.getExerciseById(s.exId);
      if (!ex) return '';
      const icon = s.type === 'improve' ? '<i data-lucide="trending-down" style="color:var(--warning); width:18px;"></i>' : 
                   s.type === 'repeat' ? '<i data-lucide="clock" style="color:var(--accent-light); width:18px;"></i>' : 
                   '<i data-lucide="check-circle" style="color:var(--success); width:18px;"></i>';
      
      return `
        <div class="card" style="padding:12px; display:flex; align-items:center; gap:12px; border-left:3px solid ${s.type === 'improve' ? 'var(--warning)' : s.type === 'repeat' ? 'var(--accent)' : 'var(--border)'};">
          <div style="display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:8px; background:var(--bg-elevated);">
            ${icon}
          </div>
          <div style="flex:1;">
            <div style="font-weight:700; font-size:14px; color:var(--text-white);">${ex.name}</div>
            <div style="font-size:12px; color:var(--text-secondary);">${s.reason}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="startQuickSession('muscle')" style="padding:4px 8px; font-size:12px;">Go</button>
        </div>
      `;
    }).join('') + `</div>`;
}

function sessionHistoryCard(s) {
  const icons = { muscle: '<i data-lucide="dumbbell"></i>', bodyweight: '<i data-lucide="person-standing"></i>', run: '<i data-lucide="activity"></i>', cycle: '<i data-lucide="bike"></i>' };
  const classes = { muscle: 'icon-muscle', bodyweight: 'icon-bodyweight', run: 'icon-run', cycle: 'icon-cycle' };
  const labels = { muscle: 'Musculation', bodyweight: 'Poids du corps', run: 'Course à pied', cycle: 'Vélo' };
  const d = new Date(s.date);
  const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const dur = s.duration ? formatDuration(s.duration) : '—';
  const setCount = DB.getSetsForSession(s.id).length;
  const meta = (s.sport === 'muscle' || s.sport === 'bodyweight')
    ? `${setCount} séries • ${dur}`
    : `${s.distance ? s.distance + ' km • ' : ''}${dur}`;
  return `<div class="history-item" onclick="showSessionDetail('${s.id}')">
    <div class="history-sport-icon ${classes[s.sport]}">${icons[s.sport]}</div>
    <div class="history-info">
      <div class="history-name">${labels[s.sport]}</div>
      <div class="history-meta">${dateStr} · ${meta}</div>
    </div>
    <div class="history-arrow"><i data-lucide="chevron-right" style="width:20px;color:var(--text-muted);"></i></div>
  </div>`;
}

// ─────────────────────────────────────────────
// SESSION VIEW
// ─────────────────────────────────────────────
function renderSessionView() {
  // Recover unfinished session from DB if state was lost
  if (!activeSessionId) {
    const unfinished = DB.getSessions().find(s => !s.finished);
    if (unfinished) {
      activeSessionId = unfinished.id;
      activeSessionSport = unfinished.sport;
    }
  }
  const banner = document.getElementById('active-session-banner');
  if (activeSessionId) {
    const sess = DB.getSessionById(activeSessionId);
    if (sess && !sess.finished) {
      banner.classList.remove('hidden');
      const labels = {
        muscle: '<i data-lucide="dumbbell" style="width:16px;margin-bottom:-2px;margin-right:4px;"></i> Musculation',
        bodyweight: '<i data-lucide="person-standing" style="width:16px;margin-bottom:-2px;margin-right:4px;"></i> Poids du corps',
        run: '<i data-lucide="activity" style="width:16px;margin-bottom:-2px;margin-right:4px;"></i> Course',
        cycle: '<i data-lucide="bike" style="width:16px;margin-bottom:-2px;margin-right:4px;"></i> Vélo'
      };
      document.getElementById('active-session-info').innerHTML =
        labels[sess.sport] || sess.sport;
      return;
    }
  }
  banner.classList.add('hidden');
}

function setSessionMode(mode) {
  isPastSessionMode = (mode === 'past');
  document.getElementById('btn-mode-live').style.background = isPastSessionMode ? 'transparent' : 'var(--bg-elevated)';
  document.getElementById('btn-mode-live').style.color = isPastSessionMode ? 'var(--text-secondary)' : 'var(--text-white)';
  
  document.getElementById('btn-mode-past').style.background = isPastSessionMode ? 'var(--bg-elevated)' : 'transparent';
  document.getElementById('btn-mode-past').style.color = isPastSessionMode ? 'var(--text-white)' : 'var(--text-secondary)';
  
  if (isPastSessionMode) {
    document.getElementById('past-session-inputs').classList.remove('hidden');
    // Set default date to now
    const now = new Date();
    // Format to YYYY-MM-DDThh:mm for datetime-local
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('past-session-date').value = now.toISOString().slice(0, 16);
  } else {
    document.getElementById('past-session-inputs').classList.add('hidden');
  }
}

function selectSport(sport) {
  // Check if past mode validation
  let overrideDate = null;
  let overrideDuration = 0;
  
  if (isPastSessionMode) {
    const rawDate = document.getElementById('past-session-date').value;
    overrideDuration = parseInt(document.getElementById('past-session-duration').value, 10);
    
    if (!rawDate || isNaN(overrideDuration) || overrideDuration <= 0) {
      showToast('Veuillez entrer une date et une durée valide', 'warning');
      return;
    }
    overrideDate = new Date(rawDate).toISOString();
  }

  // If there's already an active unfinished session, resume it instead
  if (activeSessionId && !isPastSessionMode) {
    const sess = DB.getSessionById(activeSessionId);
    if (sess && !sess.finished) {
      resumeActiveSession();
      return;
    }
  }
  
  activeSessionSport = sport;
  const session = DB.createSession(sport);
  
  if (isPastSessionMode) {
    // Force date directly in DB since createSession uses 'now'
    DB.updateSession(session.id, { date: overrideDate, isPast: true, manualDuration: overrideDuration });
    session.date = overrideDate;
  }
  
  activeSessionId = session.id;
  sessionStartTime = Date.now();
  sessionElapsedMs = 0;
  clearInterval(sessionTimerInterval);

  // Hide selector, show correct panel
  document.getElementById('session-selector').style.display = 'none';
  document.getElementById('session-muscle').classList.add('hidden');
  document.getElementById('session-cardio').classList.add('hidden');

  if (sport === 'muscle' || sport === 'bodyweight') {
    document.getElementById('session-muscle').classList.remove('hidden');
    document.title = sport === 'bodyweight' ? '🏋️ Poids du corps' : '🏋️ Musculation';
    document.querySelector('#session-muscle .page-title').innerHTML = sport === 'bodyweight' 
      ? '<i data-lucide="person-standing" style="width:24px;margin-bottom:-4px;margin-right:8px;"></i> Poids du corps'
      : '<i data-lucide="dumbbell" style="width:24px;margin-bottom:-4px;margin-right:8px;"></i> Musculation';
    document.getElementById('session-exercises-list').innerHTML = '';
    document.getElementById('log-set-panel').classList.add('hidden');
    refreshIcons();
    
    // Hide timer if past session
    document.getElementById('session-muscle-timer').style.display = isPastSessionMode ? 'none' : 'block';
  } else {
    document.getElementById('session-cardio').classList.remove('hidden');
    const icons = {
      run: '<i data-lucide="activity" style="width:24px;margin-bottom:-4px;margin-right:8px;"></i> Course à pied',
      cycle: '<i data-lucide="bike" style="width:24px;margin-bottom:-4px;margin-right:8px;"></i> Vélo d\'intérieur'
    };
    document.getElementById('cardio-title').innerHTML = icons[sport] || sport;
    const powerField = document.getElementById('cardio-power-field');
    powerField.style.display = sport === 'cycle' ? 'block' : 'none';
    cardioElapsed = 0;
    cardioRunning = false;
    
    if (isPastSessionMode) {
       document.getElementById('cardio-timer').textContent = formatDuration(overrideDuration * 60);
       document.getElementById('cardio-play-btn').style.display = 'none';
       document.querySelector('#cardio-play-btn + button').style.display = 'none'; // hide reset
       cardioElapsed = overrideDuration * 60; // Set for save logic
    } else {
      document.getElementById('cardio-timer').textContent = '00:00:00';
      document.getElementById('cardio-play-btn').style.display = 'block';
      document.getElementById('cardio-play-btn').innerHTML = '<i data-lucide="play" style="width:18px;margin-bottom:-4px;"></i> Démarrer';
      document.querySelector('#cardio-play-btn + button').style.display = 'block';
    }
    
    document.getElementById('cardio-distance').value = '';
    document.getElementById('cardio-hr').value = '';
    document.getElementById('cardio-pace').textContent = '—';
    document.getElementById('cardio-speed').textContent = '—';
  }
  // Single timer start
  if (!isPastSessionMode) {
    sessionTimerInterval = setInterval(updateSessionTimer, 1000);
  }
}

function resumeActiveSession() {
  if (!activeSessionId) return;
  const sess = DB.getSessionById(activeSessionId);
  if (!sess) return;
  document.getElementById('session-selector').style.display = 'none';
  document.getElementById('session-muscle').classList.add('hidden');
  document.getElementById('session-cardio').classList.add('hidden');
  if (sess.sport === 'muscle' || sess.sport === 'bodyweight') {
    document.getElementById('session-muscle').classList.remove('hidden');
    document.querySelector('#session-muscle .page-title').innerHTML = sess.sport === 'bodyweight' 
      ? '<i data-lucide="person-standing" style="width:24px;margin-bottom:-4px;margin-right:8px;"></i> Poids du corps'
      : '<i data-lucide="dumbbell" style="width:24px;margin-bottom:-4px;margin-right:8px;"></i> Musculation';
    renderExerciseBlocks();
    refreshIcons();
  } else {
    document.getElementById('session-cardio').classList.remove('hidden');
  }
}

function updateSessionTimer() {
  sessionElapsedMs += 1000;
  const d = document.getElementById('session-muscle-timer');
  if (d) d.textContent = formatDuration(sessionElapsedMs / 1000);
}

// ─────────────────────────────────────────────
// EXERCISE SELECTOR MODAL
// ─────────────────────────────────────────────
let currentExerciseCat = 'Tous';

function openExerciseSelector() {
  currentExerciseCat = 'Tous';
  document.getElementById('exercise-search').value = '';
  renderExerciseCategoryChips();
  filterExercises();
  document.getElementById('modal-exercise').classList.add('open');
}

function closeExerciseModal() {
  document.getElementById('modal-exercise').classList.remove('open');
}

function renderExerciseCategoryChips() {
  const exercises = DB.getExercises();
  const cats = ['Tous', ...new Set(exercises.map(e => e.category))];
  const container = document.getElementById('exercise-category-chips');
  container.innerHTML = cats.map(c =>
    `<div class="chip ${c === currentExerciseCat ? 'active' : ''}" onclick="setCatFilter('${c}')">${c}</div>`
  ).join('');
}

function setCatFilter(cat) {
  currentExerciseCat = cat;
  renderExerciseCategoryChips();
  filterExercises();
}

function filterExercises() {
  const q = (document.getElementById('exercise-search').value || '').toLowerCase();
  const exercises = DB.getExercises().filter(e => {
    const catOk = currentExerciseCat === 'Tous' || e.category === currentExerciseCat;
    const qOk = !q || e.name.toLowerCase().includes(q);
    return catOk && qOk;
  });

  const container = document.getElementById('exercise-list-items');
  if (!exercises.length) {
    container.innerHTML = '<div class="empty-state" style="padding:20px;"><div class="empty-desc">Aucun exercice trouvé</div></div>';
    return;
  }
  container.innerHTML = exercises.map(e =>
    `<div class="exercise-item" onclick="addExerciseToSession('${e.id}')">
      <div>
        <div class="exercise-item-name">${e.name}</div>
        <div class="exercise-item-cat">${e.category}</div>
      </div>
      <div style="color:var(--text-muted);display:flex;align-items:center;"><i data-lucide="plus"></i></div>
    </div>`
  ).join('');
}

function addExerciseToSession(exerciseId) {
  closeExerciseModal();
  const sess = DB.getSessionById(activeSessionId);
  if (!sess) return;
  if (!sess.exercises) sess.exercises = [];
  if (!sess.exercises.includes(exerciseId)) {
    const exercises = [...(sess.exercises || []), exerciseId];
    DB.updateSession(activeSessionId, { exercises });
  }
  activeExerciseId = exerciseId;
  showLogSetPanel(exerciseId);
  renderExerciseBlocks();
}

function renderExerciseBlocks() {
  const sess = DB.getSessionById(activeSessionId);
  if (!sess) return;
  const container = document.getElementById('session-exercises-list');
  if (!sess.exercises || !sess.exercises.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = sess.exercises.map(exId => {
    const ex = DB.getExerciseById(exId);
    const sets = DB.getSets().filter(s => s.sessionId === activeSessionId && s.exerciseId === exId);
    const vol = sets.reduce((a, s) => a + s.weight * s.reps, 0);
    const best1rm = sets.length ? Math.max(...sets.map(s => calc1RM(s.weight, s.reps))) : null;
    const isActive = exId === activeExerciseId;
    return `<div class="exercise-block ${isActive ? 'ring-active' : ''}" id="block-${exId}">
      <div class="exercise-block-header" onclick="selectExercise('${exId}')">
        <div>
          <div class="exercise-block-name">${ex ? ex.name : exId}</div>
          <div class="exercise-block-meta">${sets.length} série(s) · ${Math.round(vol)} kg · ${best1rm ? '1RM estimé : ' + best1rm + ' kg' : '—'}</div>
        </div>
        <div style="color:var(--accent-light);display:flex;align-items:center;">${isActive ? '<i data-lucide="edit-2" style="width:16px;height:16px;"></i>' : '<i data-lucide="chevron-right" style="width:20px;height:20px;"></i>'}</div>
      </div>
      <div>
        ${sets.map((s, i) => `
          <div class="set-row">
            <div class="set-number">${i + 1}</div>
            <div class="set-data">${s.reps} rép × ${s.weight} kg</div>
            <div class="set-orm" style="margin-right:8px;">1RM: ${calc1RM(s.weight, s.reps)} kg</div>
            <button style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;" onclick="deleteSet('${s.id}','${exId}')"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function selectExercise(exId) {
  activeExerciseId = exId;
  showLogSetPanel(exId);
  renderExerciseBlocks();
}

function deleteSet(setId, exId) {
  DB.deleteSet(setId);
  renderExerciseBlocks();
  if (activeExerciseId === exId) showLogSetPanel(exId);
}

// ─────────────────────────────────────────────
// LOG SET PANEL
// ─────────────────────────────────────────────
function showLogSetPanel(exerciseId) {
  const ex = DB.getExerciseById(exerciseId);
  document.getElementById('log-set-panel').classList.remove('hidden');
  document.getElementById('log-exercise-name').textContent = ex ? ex.name : exerciseId;

  const lesteContainer = document.getElementById('leste-container');
  const labelWeight = document.getElementById('label-weight');
  if (activeSessionSport === 'bodyweight') {
    if (lesteContainer) lesteContainer.classList.remove('hidden');
    if (labelWeight) labelWeight.parentElement.style.display = 'none';
  } else {
    if (lesteContainer) lesteContainer.classList.add('hidden');
    if (labelWeight) labelWeight.parentElement.style.display = 'block';
  }

  // Show PR
  const pr = DB.getPRForExercise(exerciseId);
  const prBadge = document.getElementById('log-pr-badge');
  const prInfo = document.getElementById('log-pr-info');
  if (pr) {
    prInfo.classList.remove('hidden');
    document.getElementById('log-pr-value').textContent = `${pr.reps} rép × ${pr.weight} kg → 1RM ${pr.orm} kg`;
  } else {
    prInfo.classList.add('hidden');
    prBadge.classList.add('hidden');
  }
  // Pre-fill with last set values
  const allSets = DB.getSetsForExercise(exerciseId);
  if (allSets.length) {
    const last = allSets[allSets.length - 1];
    document.getElementById('stepper-reps').textContent = last.reps;
    document.getElementById('stepper-weight').textContent = last.weight;
  } else {
    document.getElementById('stepper-reps').textContent = '10';
    document.getElementById('stepper-weight').textContent = '20';
  }
}

function stepperChange(field, delta) {
  const el = document.getElementById('stepper-' + field);
  let val = parseFloat(el.textContent) || 0;
  val = Math.max(0, val + delta);
  el.textContent = field === 'weight' ? val.toFixed(delta % 1 !== 0 ? 1 : 0) : Math.round(val);
  checkLivePR();
}

function checkLivePR() {
  if (!activeExerciseId) return;
  const reps = parseFloat(document.getElementById('stepper-reps').textContent) || 0;
  const weight = parseFloat(document.getElementById('stepper-weight').textContent) || 0;
  const orm = calc1RM(weight, reps);
  const pr = DB.getPRForExercise(activeExerciseId);
  const badge = document.getElementById('log-pr-badge');
  if (pr && orm > pr.orm) {
    badge.classList.remove('hidden');
    badge.innerHTML = '<i data-lucide="award" style="width:14px;margin-bottom:-2px;margin-right:2px;"></i> Nouveau PR !';
  } else if (!pr && reps > 0 && weight > 0) {
    badge.classList.remove('hidden');
    badge.innerHTML = '<i data-lucide="star" style="width:14px;margin-bottom:-2px;margin-right:2px;"></i> Premier record !';
  } else {
    badge.classList.add('hidden');
  }
}

function logSet() {
  if (!activeExerciseId || !activeSessionId) { showToast('Sélectionnez un exercice d\'abord', 'warning'); return; }
  const reps = parseFloat(document.getElementById('stepper-reps').textContent) || 0;
  let weight = parseFloat(document.getElementById('stepper-weight').textContent) || 0;
  
  if (activeSessionSport === 'bodyweight') {
    const leste = parseFloat(document.getElementById('stepper-leste').textContent) || 0;
    const metrics = DB.getMetrics();
    const userWeight = metrics.length ? metrics[metrics.length - 1].weight : 70;
    weight = parseFloat((userWeight + leste).toFixed(1));
  }
  
  if (reps <= 0) { showToast('Entrez un nombre de répétitions', 'warning'); return; }

  DB.addSet(activeSessionId, activeExerciseId, reps, weight);
  renderExerciseBlocks();
  showLogSetPanel(activeExerciseId);
  showToast(`<i data-lucide="check" style="width:16px;margin-bottom:-3px;margin-right:4px;"></i> ${reps} rép × ${weight} kg enregistré`, 'success');

  // Start rest timer
  const settings = DB.getSettings();
  startRestTimer(settings.restDuration, '');
}

// ─────────────────────────────────────────────
// REST TIMER
// ─────────────────────────────────────────────
const CIRC = 2 * Math.PI * 100; // r=100

function startRestTimer(seconds, nextExercise) {
  restTotal = seconds;
  restRemaining = seconds;
  clearInterval(restTimerInterval);
  const overlay = document.getElementById('rest-timer-overlay');
  overlay.classList.add('visible');
  document.getElementById('rest-next-exercise').textContent = nextExercise || '—';
  updateRestTimerDisplay();
  restTimerInterval = setInterval(() => {
    restRemaining--;
    updateRestTimerDisplay();
    if (restRemaining <= 0) {
      clearInterval(restTimerInterval);
      skipRestTimer();
      showToast('<i data-lucide="timer" style="width:16px;margin-bottom:-3px;margin-right:4px;"></i> Récupération terminée !', 'success');
      // vibration
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }, 1000);
}

function updateRestTimerDisplay() {
  const el = document.getElementById('rest-timer-display');
  el.textContent = restRemaining;
  el.className = 'timer-display' + (restRemaining <= 10 ? ' urgent' : restRemaining <= 0 ? ' done' : '');
  // Update ring
  const progress = restTotal > 0 ? restRemaining / restTotal : 0;
  const offset = CIRC - progress * CIRC;
  document.getElementById('timer-progress-circle').style.strokeDasharray = CIRC;
  document.getElementById('timer-progress-circle').style.strokeDashoffset = offset;
}

function skipRestTimer() {
  clearInterval(restTimerInterval);
  document.getElementById('rest-timer-overlay').classList.remove('visible');
}

function addRestTime(secs) {
  restRemaining += secs;
  restTotal += secs;
  updateRestTimerDisplay();
}

// ─────────────────────────────────────────────
// FINISH SESSION
// ─────────────────────────────────────────────
function finishSession() {
  if (!activeSessionId) return;
  const sess = DB.getSessionById(activeSessionId);
  const duration = sess.isPast && sess.manualDuration ? (sess.manualDuration * 60) : Math.round(sessionElapsedMs / 1000);
  DB.updateSession(activeSessionId, { finished: true, duration });
  clearInterval(sessionTimerInterval);
  skipRestTimer();
  const sets = DB.getSetsForSession(activeSessionId);
  const vol = sets.reduce((a, s) => a + s.weight * s.reps, 0);
  showToast(`<i data-lucide="check-circle-2" style="width:18px;margin-bottom:-4px;margin-right:4px;"></i> Séance terminée ! ${sets.length} séries / ${Math.round(vol)} kg`, 'success');
  resetToSessionSelector();
}

function finishCardioSession() {
  if (!activeSessionId) return;
  const dist = parseFloat(document.getElementById('cardio-distance').value) || 0;
  const hr = parseFloat(document.getElementById('cardio-hr').value) || null;
  const power = parseFloat(document.getElementById('cardio-power').value) || null;
  const notes = document.getElementById('cardio-notes').value || '';
  clearInterval(cardioTimerInterval);
  DB.updateSession(activeSessionId, {
    finished: true,
    duration: cardioElapsed,
    distance: dist,
    heartRate: hr,
    power,
    notes,
  });
  showToast(`<i data-lucide="check-circle-2" style="width:18px;margin-bottom:-4px;margin-right:4px;"></i> Séance cardio terminée ! ${dist} km`, 'success');
  resetToSessionSelector();
}

function resetToSessionSelector() {
  activeSessionId = null;
  activeSessionSport = null;
  activeExerciseId = null;
  clearInterval(sessionTimerInterval);
  clearInterval(cardioTimerInterval);
  document.getElementById('session-selector').style.display = '';
  document.getElementById('session-muscle').classList.add('hidden');
  document.getElementById('session-cardio').classList.add('hidden');
  document.getElementById('log-set-panel').classList.add('hidden');
  document.getElementById('active-session-banner').classList.add('hidden');
}

// ─────────────────────────────────────────────
// CARDIO TIMER
// ─────────────────────────────────────────────
function toggleCardioTimer() {
  const btn = document.getElementById('cardio-play-btn');
  if (cardioRunning) {
    clearInterval(cardioTimerInterval);
    cardioRunning = false;
    btn.textContent = '▶ Reprendre';
  } else {
    cardioRunning = true;
    btn.textContent = '⏸ Pause';
    cardioTimerInterval = setInterval(() => {
      cardioElapsed++;
      document.getElementById('cardio-timer').textContent = formatDuration(cardioElapsed);
      updateCardioPace();
    }, 1000);
  }
}

function resetCardioTimer() {
  clearInterval(cardioTimerInterval);
  cardioRunning = false;
  cardioElapsed = 0;
  document.getElementById('cardio-timer').textContent = '00:00:00';
  document.getElementById('cardio-play-btn').textContent = '▶ Démarrer';
}

function updateCardioPace() {
  const dist = parseFloat(document.getElementById('cardio-distance').value) || 0;
  const duration = cardioElapsed;
  if (dist > 0 && duration > 0) {
    const hours = duration / 3600;
    const speed = dist / hours;
    document.getElementById('cardio-speed').textContent = speed.toFixed(1);
    const paceSec = duration / dist;
    const paceMin = Math.floor(paceSec / 60);
    const paceSc = Math.round(paceSec % 60);
    document.getElementById('cardio-pace').textContent = `${paceMin}:${String(paceSc).padStart(2, '0')}`;
  } else {
    document.getElementById('cardio-speed').textContent = '—';
    document.getElementById('cardio-pace').textContent = '—';
  }
}

// ─────────────────────────────────────────────
// HISTORY & CALENDAR
// ─────────────────────────────────────────────
function renderHistory() {
  calSelectedDay = null;
  renderCalendar();
  renderHistoryList(null);
}

function startPastSessionFromHistory() {
  navigate('session');
  setSessionMode('past');

  // If a specific day was selected in the calendar, pre-fill it
  const dateInput = document.getElementById('past-session-date');
  if (calSelectedDay && dateInput) {
    const y = calCurrentDate.getFullYear();
    const m = calCurrentDate.getMonth();
    // Default to 12:00 PM for typical entry
    const localDate = new Date(y, m, calSelectedDay, 12, 0, 0);
    // Adjust to ISO format string 'YYYY-MM-DDThh:mm'
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    dateInput.value = localDate.toISOString().slice(0, 16);
  }
}

function calNav(delta) {
  calCurrentDate = new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth() + delta, 1);
  renderCalendar();
  renderHistoryList(null);
}

function renderCalendar() {
  const y = calCurrentDate.getFullYear();
  const m = calCurrentDate.getMonth();
  const monthStart = new Date(y, m, 1);
  const monthEnd = new Date(y, m + 1, 0);

  document.getElementById('history-month-label').textContent =
    monthStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const dayCodes = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  document.getElementById('cal-day-headers').innerHTML =
    dayCodes.map(d => `<div class="cal-header">${d}</div>`).join('');

  // Map sessions by day
  const sessions = DB.getSessionsInRange(monthStart, new Date(y, m + 1, 0, 23, 59, 59))
    .filter(s => s.finished);
  const sessMap = {};
  sessions.forEach(s => {
    const key = new Date(s.date).getDate();
    if (!sessMap[key]) sessMap[key] = [];
    sessMap[key].push(s);
  });

  const today = new Date();
  let html = '';
  let startDow = (monthStart.getDay() + 6) % 7; // Mon=0
  for (let i = 0; i < startDow; i++) html += '<div class="cal-day empty"></div>';

  for (let day = 1; day <= monthEnd.getDate(); day++) {
    const isToday = y === today.getFullYear() && m === today.getMonth() && day === today.getDate();
    const daySessions = sessMap[day] || [];
    const hasSess = daySessions.length > 0;
    const sportColors = { muscle: 'var(--sport-muscle)', run: 'var(--sport-run)', cycle: 'var(--sport-cycle)' };
    const dots = [...new Set(daySessions.map(s => s.sport))].map(sp =>
      `<div class="sport-dot" style="background:${sportColors[sp] || 'var(--accent)'}"></div>`).join('');

    html += `<div class="cal-day ${isToday ? 'today' : ''} ${hasSess ? 'has-session' : ''} ${calSelectedDay === day ? 'selected' : ''}"
      onclick="selectCalDay(${day})" style="${calSelectedDay === day ? 'background:var(--bg-elevated);' : ''}">
      ${day}
      <div class="sport-dots">${dots}</div>
    </div>`;
  }
  document.getElementById('cal-grid').innerHTML = html;
}

function selectCalDay(day) {
  calSelectedDay = calSelectedDay === day ? null : day;
  renderCalendar();
  renderHistoryList(calSelectedDay);
}

function renderHistoryList(day) {
  const y = calCurrentDate.getFullYear();
  const m = calCurrentDate.getMonth();
  let sessions;
  if (day) {
    const start = new Date(y, m, day, 0, 0, 0);
    const end = new Date(y, m, day, 23, 59, 59);
    sessions = DB.getSessionsInRange(start, end).filter(s => s.finished);
    document.getElementById('history-list-title').textContent = `${day} ${new Date(y, m, day).toLocaleDateString('fr-FR', { month: 'long' })}`;
  } else {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0, 23, 59, 59);
    sessions = DB.getSessionsInRange(start, end).filter(s => s.finished);
    document.getElementById('history-list-title').textContent = 'Ce mois-ci';
  }
  sessions = sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
  const el = document.getElementById('history-sessions-list');
  if (!sessions.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="calendar-x"></i></div><div class="empty-title">Aucune séance</div></div>`;
    return;
  }
  el.innerHTML = sessions.map(s => sessionHistoryCard(s)).join('');
}

// ─────────────────────────────────────────────
// SESSION DETAIL MODAL
// ─────────────────────────────────────────────
function showSessionDetail(sessionId) {
  selectedDetailSessionId = sessionId;
  const s = DB.getSessionById(sessionId);
  if (!s) return;
  const icons = { muscle: '<i data-lucide="dumbbell"></i>', bodyweight: '<i data-lucide="person-standing"></i>', run: '<i data-lucide="activity"></i>', cycle: '<i data-lucide="bike"></i>' };
  const labels = { muscle: 'Musculation', bodyweight: 'Poids du corps', run: 'Course à pied', cycle: 'Vélo' };
  const d = new Date(s.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dur = s.duration ? formatDuration(s.duration) : '—';
  let bodyHtml = `<div style="text-align:center;margin-bottom:var(--space-md);">
    <div style="font-size:40px;">${icons[s.sport]}</div>
    <div style="font-size:20px;font-weight:800;color:var(--text-white);margin-top:8px;">${labels[s.sport]}</div>
    <div style="font-size:13px;color:var(--text-secondary);">${d}</div>
    <div style="font-size:13px;color:var(--text-secondary);">Durée : ${dur}</div>
  </div>`;

  if (s.sport === 'muscle' || s.sport === 'bodyweight') {
    const sets = DB.getSetsForSession(sessionId);
    const vol = sets.reduce((a, s2) => a + s2.weight * s2.reps, 0);
    bodyHtml += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:var(--space-md);">
      <div class="kpi-card"><div class="kpi-label">Séries</div><div class="kpi-value">${sets.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Volume</div><div class="kpi-value">${Math.round(vol)}<span class="kpi-unit"> kg</span></div></div>
    </div>`;
    if (s.exercises && s.exercises.length) {
      bodyHtml += s.exercises.map(exId => {
        const ex = DB.getExerciseById(exId);
        const exSets = sets.filter(s2 => s2.exerciseId === exId);
        return `<div style="margin-bottom:12px;">
          <div style="font-weight:700;font-size:14px;color:var(--text-primary);margin-bottom:6px;">${ex ? ex.name : exId}</div>
          ${exSets.map((s2, i) => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid var(--border);">
            <span style="color:var(--text-muted);">Série ${i + 1}</span>
            <span>${s2.reps} rép × ${s2.weight} kg</span>
            <span style="color:var(--text-secondary);">1RM: ${calc1RM(s2.weight, s2.reps)} kg</span>
          </div>`).join('')}
        </div>`;
      }).join('');
    }
  } else {
    bodyHtml += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:var(--space-md);">
      <div class="kpi-card"><div class="kpi-label">Distance</div><div class="kpi-value">${s.distance || '—'}<span class="kpi-unit"> km</span></div></div>
      <div class="kpi-card"><div class="kpi-label">Durée</div><div class="kpi-value" style="font-size:18px;">${dur}</div></div>
    </div>`;
    if (s.notes) bodyHtml += `<div style="font-size:13px;color:var(--text-secondary);margin-top:8px;"><i data-lucide="file-text" style="width:14px;margin-bottom:-2px;margin-right:4px;"></i> ${s.notes}</div>`;
  }

  document.getElementById('session-detail-content').innerHTML = bodyHtml;
  document.getElementById('modal-session-detail').classList.add('open');
}

function closeSessionDetail() {
  document.getElementById('modal-session-detail').classList.remove('open');
}

function deleteCurrentSession() {
  if (!selectedDetailSessionId) return;
  if (!confirm('Supprimer cette séance et toutes ses séries ?')) return;
  DB.deleteSession(selectedDetailSessionId);
  closeSessionDetail();
  renderHistory();
  showToast('Séance supprimée', 'warning');
}

function editPastSession() {
  if (!selectedDetailSessionId) return;
  const s = DB.getSessionById(selectedDetailSessionId);
  if (!s) return;
  closeSessionDetail();
  navigate('session');
  setSessionMode('past');
  
  const manualDur = s.duration ? Math.round(s.duration / 60) : 0;
  DB.updateSession(s.id, { isPast: true, manualDuration: manualDur });
  
  activeSessionId = s.id;
  activeSessionSport = s.sport;
  
  const d = new Date(s.date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  document.getElementById('past-session-date').value = d.toISOString().slice(0, 16);
  document.getElementById('past-session-duration').value = manualDur;

  resumeActiveSession();
  showToast('Saisies en mode modification', 'info');
}

// ─────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────
let currentStatSport = 'muscle';

function renderStats() {
  if (currentStatSport === 'muscle') {
    renderMuscleStatExerciseSelect();
    renderMuscleStats();
  } else {
    renderCardioStats();
  }
  renderPRList();
}

function selectStatSport(sport, chip) {
  currentStatSport = sport;
  document.querySelectorAll('#stats-sport-chips .chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  document.getElementById('stats-muscle').classList.toggle('hidden', sport !== 'muscle');
  document.getElementById('stats-cardio').classList.toggle('hidden', sport === 'muscle');
  if (sport === 'muscle') { renderMuscleStatExerciseSelect(); renderMuscleStats(); renderPRList(); }
  else renderCardioStats();
}

function renderMuscleStatExerciseSelect() {
  const sel = document.getElementById('stats-exercise-select');
  const exercises = DB.getExercises();
  const allSets = DB.getSets();
  const usedIds = new Set(allSets.map(s => s.exerciseId));
  const used = exercises.filter(e => usedIds.has(e.id));
  if (!used.length) {
    sel.innerHTML = '<option>Aucun exercice — faites une séance !</option>';
    return;
  }
  sel.innerHTML = used.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
}

function renderMuscleStats() {
  const sel = document.getElementById('stats-exercise-select');
  const exId = sel.value;
  if (!exId) return;
  const sets = DB.getSetsForExercise(exId);
  if (!sets.length) return;

  // Group by session date
  const sessions = DB.getSessions().filter(s => s.finished);
  const grouped = {};
  sets.forEach(s => {
    const sess = sessions.find(se => se.id === s.sessionId);
    if (!sess) return;
    const key = new Date(sess.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  const labels = Object.keys(grouped).slice(-12);
  const orms = labels.map(k => Math.max(...grouped[k].map(s => calc1RM(s.weight, s.reps))));
  const vols = labels.map(k => grouped[k].reduce((a, s) => a + s.weight * s.reps, 0));

  drawLineChart('chart-orm', labels, orms, '1RM estimé (kg)', '#a78bfa');
  drawBarChart('chart-volume', labels, vols, 'Volume (kg)', 'rgba(124,58,237,0.7)');
}

function renderCardioStats() {
  const sport = currentStatSport;
  const sessions = DB.getSessions().filter(s => s.finished && s.sport === sport && s.distance).slice(-12);
  const labels = sessions.map(s => new Date(s.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
  const distances = sessions.map(s => s.distance || 0);
  const paces = sessions.map(s => {
    if (!s.distance || !s.duration) return 0;
    return parseFloat((s.duration / 60 / s.distance).toFixed(2));
  });
  drawBarChart('chart-cardio-distance', labels, distances, 'Distance (km)', 'rgba(16,185,129,0.7)');
  drawLineChart('chart-cardio-pace', labels, paces, 'Allure (min/km)', '#34d399');
}

function renderPRList() {
  const exercises = DB.getExercises();
  const container = document.getElementById('stats-pr-list');
  const prs = exercises.map(e => {
    const pr = DB.getPRForExercise(e.id);
    return pr ? { name: e.name, ...pr } : null;
  }).filter(Boolean).sort((a, b) => b.orm - a.orm);

  if (!prs.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="award" style="width:32px;height:32px;"></i></div><div class="empty-title">Aucun record encore</div></div>';
    return;
  }
  container.innerHTML = `<div class="card"><table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="color:var(--text-muted);font-size:11px;font-weight:700;">
      <th style="text-align:left;padding:6px 0;">Exercice</th>
      <th style="text-align:center;padding:6px 0;">Série</th>
      <th style="text-align:center;padding:6px 0;">1RM est.</th>
    </tr></thead>
    <tbody>${prs.map((p, i) => {
    const rankHtml = i === 0 ? '<i data-lucide="medal" style="width:16px;color:#fbbf24;margin-bottom:-3px;margin-right:4px;"></i>' :
      i === 1 ? '<i data-lucide="medal" style="width:16px;color:#94a3b8;margin-bottom:-3px;margin-right:4px;"></i>' :
        i === 2 ? '<i data-lucide="medal" style="width:16px;color:#b45309;margin-bottom:-3px;margin-right:4px;"></i>' : '';
    return `<tr style="border-top:1px solid var(--border);">
      <td style="padding:8px 0;font-weight:600;color:var(--text-primary);">
        ${rankHtml}${p.name}
      </td>
      <td style="text-align:center;color:var(--text-secondary);">${p.reps} × ${p.weight} kg</td>
      <td style="text-align:center;font-weight:700;color:var(--accent-light);">${p.orm} kg</td>
    </tr>`}).join('')}</tbody>
  </table></div>`;
}

// Charts helpers
function getChartDefaults() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9492a6', font: { size: 10 } } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9492a6', font: { size: 10 } } },
    },
  };
}

function drawLineChart(id, labels, data, label, color) {
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label, data,
        borderColor: color,
        backgroundColor: color.replace(')', ',0.1)').replace('rgb', 'rgba'),
        fill: true,
        tension: 0.4,
        pointBackgroundColor: color,
        pointRadius: 4,
      }]
    },
    options: { ...getChartDefaults() }
  });
}

function drawBarChart(id, labels, data, label, color) {
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label, data, backgroundColor: color, borderRadius: 6 }]
    },
    options: { ...getChartDefaults() }
  });
}

// ─────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────
function renderHealth() {
  const metrics = DB.getMetrics();
  const profile = DB.getProfile();

  // Set defaults
  const dateEl = document.getElementById('metric-date');
  if (!dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
  
  const nameEl = document.getElementById('metric-name');
  if (nameEl && document.activeElement !== nameEl) {
    nameEl.value = profile.name || '';
  }

  if (metrics.length) {
    const last = metrics[metrics.length - 1];
    document.getElementById('current-bmi').textContent = last.bmi;
    document.getElementById('current-weight-display').textContent = last.weight + ' kg';
    const cat = getBMICategory(last.bmi);
    const badge = document.getElementById('bmi-category-badge');
    badge.textContent = cat.label;
    badge.style.background = cat.color + '22';
    badge.style.color = cat.color;
  }

  renderMetricsList(metrics);
  renderWeightChart(metrics);
}

function previewBMI() {
  const w = parseFloat(document.getElementById('metric-weight').value);
  const profile = DB.getProfile();
  const h = parseFloat(profile.height);
  const preview = document.getElementById('metric-bmi-preview');
  if (w && h) {
    const bmi = calcBMI(w, h);
    const cat = getBMICategory(bmi);
    preview.innerHTML = `IMC calculé : <strong style="color:${cat.color}">${bmi} — ${cat.label}</strong>`;
  } else {
    preview.textContent = h ? '' : 'Ajoutez votre taille dans le profil pour calculer l\'IMC.';
  }
}

function saveMetric() {
  const nameInput = document.getElementById('metric-name');
  if (nameInput) {
    const newName = nameInput.value.trim();
    if (newName) DB.saveProfile({ name: newName });
  }

  const w = parseFloat(document.getElementById('metric-weight').value);
  const date = document.getElementById('metric-date').value;
  if (!w || w < 20 || w > 400) { showToast('Poids invalide', 'error'); return; }
  const profile = DB.getProfile();
  const h = parseFloat(profile.height);
  const bmi = calcBMI(w, h);
  DB.addMetric(w, bmi, date ? new Date(date).toISOString() : undefined);
  document.getElementById('metric-weight').value = '';
  renderHealth();
  // Also refresh dashboard to update greeting
  if (currentView === 'dashboard') renderDashboard();
  showToast('✓ Mesure et infos enregistrées', 'success');
}

function renderMetricsList(metrics) {
  const el = document.getElementById('metrics-list');
  const sorted = [...metrics].reverse().slice(0, 20);
  if (!sorted.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="scale"></i></div><div class="empty-title">Aucune mesure</div></div>';
    return;
  }
  el.innerHTML = sorted.map(m => {
    const cat = getBMICategory(m.bmi);
    const d = new Date(m.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px var(--space-md);background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px;">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--text-white);">${m.weight} kg</div>
        <div style="font-size:12px;color:var(--text-muted);">${d}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:16px;font-weight:800;color:${cat.color};">${m.bmi}</div>
        <div style="font-size:11px;color:var(--text-muted);">IMC</div>
      </div>
      <button style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:8px;" onclick="deleteMetric('${m.id}')">×</button>
    </div>`;
  }).join('');
}

function deleteMetric(id) {
  DB.deleteMetric(id);
  renderHealth();
  showToast('Mesure supprimée', 'warning');
}

function renderWeightChart(metrics) {
  const labels = metrics.slice(-20).map(m => new Date(m.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
  const weights = metrics.slice(-20).map(m => m.weight);
  drawLineChart('chart-weight', labels, weights, 'Poids (kg)', '#34d399');
}

// ─────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────
function renderProfile() {
  const p = DB.getProfile();
  const s = DB.getSettings();
  if (p.name) document.getElementById('profile-name').value = p.name;
  if (p.age) document.getElementById('profile-age').value = p.age;
  if (p.height) document.getElementById('profile-height').value = p.height;
  if (p.goal) document.getElementById('profile-goal').value = p.goal;
  document.getElementById('profile-rest').value = s.restDuration || 60;

  let displayName = p.name || '';
  if (!displayName && window.currentUser && window.currentUser.email) {
    displayName = window.currentUser.email.split('@')[0];
  }
  if (!displayName) displayName = 'Votre nom';

  document.getElementById('profile-display-name').textContent = displayName;
  const goalsMap = { force: 'Développement de la force', endurance: 'Améliorer l\'endurance', poids: 'Perte de poids', sante: 'Santé générale', masse: 'Prise de masse' };
  document.getElementById('profile-display-goal').textContent = goalsMap[p.goal] || (window.currentUser ? 'Compte synchronisé' : 'Données locales');
  
  if (window.currentUser) {
    document.getElementById('btn-logout').classList.remove('hidden');
    document.getElementById('btn-login-trigger').classList.add('hidden');
  } else {
    document.getElementById('btn-logout').classList.add('hidden');
    document.getElementById('btn-login-trigger').classList.remove('hidden');
  }

  const initials = displayName !== 'Votre nom' ? displayName.slice(0, 2).toUpperCase() : '<i data-lucide="user"></i>';
  document.getElementById('profile-avatar').innerHTML = initials;
}

function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  const age = parseInt(document.getElementById('profile-age').value) || null;
  const height = parseInt(document.getElementById('profile-height').value) || null;
  const goal = document.getElementById('profile-goal').value;
  const rest = parseInt(document.getElementById('profile-rest').value) || 60;
  DB.saveProfile({ name, age, height, goal });
  DB.saveSettings({ restDuration: rest });
  renderProfile();
  showToast('✓ Profil sauvegardé', 'success');
}

function exportData() {
  const data = DB.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fittrack-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 Export téléchargé', 'success');
}

function exportDataCSV() {
  const sessions = DB.getSessions();
  const sets = DB.getSets();
  const exercises = DB.getExercises();

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Date,Sport,Exercice,Duree,Distance,Series,Repetitions,Poids\n";

  sessions.forEach(s => {
    const sDate = s.date.split('T')[0];
    if (s.sport === 'run' || s.sport === 'cycle') {
      csvContent += `${sDate},${s.sport},,${s.duration || 0},${s.distance || 0},,,\n`;
    } else {
      const sessionSets = sets.filter(st => st.sessionId === s.id);
      if (sessionSets.length === 0) {
        csvContent += `${sDate},${s.sport},,${s.duration || 0},0,,,\n`;
      }
      sessionSets.forEach((st, i) => {
        const ex = exercises.find(e => e.id === st.exerciseId);
        const exName = ex ? ex.name.replace(/,/g, '') : st.exerciseId;
        csvContent += `${sDate},${s.sport},${exName},${s.duration || 0},0,${i + 1},${st.reps},${st.weight}\n`;
      });
    }
  });

  const encodedUri = encodeURI(csvContent);
  const a = document.createElement('a');
  a.href = encodedUri;
  a.download = `fittrack-export-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast('📤 Export CSV téléchargé', 'success');
}

function confirmReset() {
  if (confirm('⚠️ Cette action est irréversible. Supprimer toutes les données ?')) {
    DB.clearAll();
    showToast('Données réinitialisées', 'warning');
    renderDashboard();
  }
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Close modals on overlay click
document.getElementById('modal-exercise').addEventListener('click', function (e) {
  if (e.target === this) closeExerciseModal();
});
document.getElementById('modal-session-detail').addEventListener('click', function (e) {
  if (e.target === this) closeSessionDetail();
});

// Contenteditable steppers — re-validate on blur
['stepper-reps', 'stepper-weight'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('blur', () => {
    const v = parseFloat(el.textContent);
    if (isNaN(v) || v < 0) el.textContent = '0';
    checkLivePR();
  });
  el.addEventListener('input', checkLivePR);
});

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
(function init() {
  navigate('dashboard');
})();

// ─────────────────────────────────────────────
// DEMO DATA SEEDER
// ─────────────────────────────────────────────
function seedDemoData() {
  DB.saveProfile({ name: 'Alex', age: 28, height: 178, goal: 'force' });
  DB.saveSettings({ restDuration: 90 });

  // 8 muscle sessions over the past 3 weeks
  const now = Date.now();
  const day = 86400000;
  const muscleDays = [21, 18, 15, 12, 9, 6, 3, 1];
  const exerciseRotations = [
    ['e2', 'e4', 'e7'],
    ['e1', 'e11', 'e13'],
    ['e6', 'e9', 'e10'],
    ['e2', 'e5', 'e8'],
    ['e1', 'e11', 'e12'],
    ['e6', 'e9', 'e10'],
    ['e2', 'e4', 'e7'],
    ['e1', 'e11', 'e13'],
  ];

  // Weights progression
  const baseWeights = { e1: 80, e2: 70, e4: 0, e5: 50, e6: 60, e7: 40, e8: 10, e9: 15, e10: 20, e11: 100, e12: 40, e13: 60 };

  muscleDays.forEach((daysAgo, idx) => {
    const sess = DB.createSession('muscle');
    const dateMs = now - daysAgo * day;
    sess.date = new Date(dateMs).toISOString();
    const exIds = exerciseRotations[idx % exerciseRotations.length];
    sess.exercises = exIds;
    sess.finished = true;
    sess.duration = 3600 + Math.floor(Math.random() * 1800);
    DB.updateSession(sess.id, sess);

    exIds.forEach(exId => {
      const base = baseWeights[exId] || 20;
      // progression: sessions later in time (higher idx) get heavier weights
      const progress = 1 + idx * 0.015;
      const w = Math.round(base * progress * 2) / 2;
      const sets = exId === 'e4' ? [
        { reps: 8, weight: 0 }, { reps: 7, weight: 0 }, { reps: 6, weight: 0 }
      ] : [
        { reps: 8, weight: w }, { reps: 8, weight: w }, { reps: 6, weight: w + 5 }
      ];
      sets.forEach(s => {
        const set = DB.addSet(sess.id, exId, s.reps, s.weight);
        set.timestamp = new Date(dateMs).toISOString();
        const all = DB.getSets();
        const i = all.findIndex(x => x.id === set.id);
        if (i !== -1) { all[i].timestamp = set.timestamp; DB._set(DB.KEYS.sets, all); }
      });
    });
  });

  // 3 run sessions
  [14, 7, 2].forEach((daysAgo, i) => {
    const sess = DB.createSession('run');
    sess.date = new Date(now - daysAgo * day).toISOString();
    sess.finished = true;
    sess.distance = 5 + i;
    sess.duration = (30 + i * 2) * 60;
    sess.notes = 'Belle sortie';
    DB.updateSession(sess.id, sess);
  });

  // Weight & BMI history
  [30, 21, 14, 7, 0].forEach((daysAgo, i) => {
    const w = 79 - i * 0.4;
    DB.addMetric(w, calcBMI(w, 178), new Date(now - daysAgo * day).toISOString());
  });
}

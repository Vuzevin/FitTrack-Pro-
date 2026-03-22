// ===== FITTRACK PRO — SUPABASE LAYER =====

const SUPABASE_URL = 'https://yvqbamjjjbycktujjoqj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cWJhbWpqamJ5Y2t0dWpqb3FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MzczNjYsImV4cCI6MjA4OTMxMzM2Nn0.UvxpS0A4Sc46wOi0HEYzPjy2zMyLm7NfYvwC8CtOmFE';

// Initialize client (Note: the CDN provides a global window.supabase object)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// Auth UI Logic
async function initAuth() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    hideAuthOverlay();
    await syncFromSupabase();
  } else {
    showAuthOverlay();
  }

  // Listen for auth changes
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      currentUser = session.user;
      hideAuthOverlay();
      await syncFromSupabase();
      navigate('dashboard'); // Refresh views
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      DB.clearAll(); // Clear local cache when logging out
      showAuthOverlay();
    }
  });
}

function showAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('bottom-nav').style.display = 'none';
  // Also hide rest timers, toasts if any
}

function hideAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('main-content').style.display = 'block';
  document.getElementById('bottom-nav').style.display = 'flex';
}

// Login/Signup functions
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-submit-btn');
  btn.textContent = 'Connexion...';
  btn.disabled = true;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  btn.textContent = 'Se connecter';
  btn.disabled = false;
  if (error) {
    alert('Erreur: ' + error.message);
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-submit-btn');
  btn.textContent = 'Inscription...';
  btn.disabled = true;

  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  btn.textContent = 'S\'inscrire';
  btn.disabled = false;
  
  if (error) {
    alert('Erreur: ' + error.message);
  } else {
    alert('Inscription réussie ! Vous pouvez maintenant vous connecter.');
    toggleAuthMode();
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
}

function toggleAuthMode() {
  const form = document.getElementById('auth-form');
  const isLogin = form.onsubmit === handleLogin;
  
  if (isLogin) {
    document.getElementById('auth-title').textContent = 'Créer un compte';
    document.getElementById('auth-submit-btn').textContent = 'S\'inscrire';
    document.getElementById('auth-switch-text').innerHTML = 'Déjà un compte ? <a href="#" onclick="toggleAuthMode(); return false;" style="color:var(--accent-light);">Se connecter</a>';
    form.onsubmit = handleSignup;
  } else {
    document.getElementById('auth-title').textContent = 'Connexion';
    document.getElementById('auth-submit-btn').textContent = 'Se connecter';
    document.getElementById('auth-switch-text').innerHTML = 'Pas encore de compte ? <a href="#" onclick="toggleAuthMode(); return false;" style="color:var(--accent-light);">S\'inscrire</a>';
    form.onsubmit = handleLogin;
  }
}

// --- DATA ADAPTERS ---
// Mapping objects for DB <-> JS conversion
function toDBObj(obj) {
  const map = {
    sessionId: 'session_id',
    exerciseId: 'exercise_id',
    machineId: 'machine_id',
    muscleGroups: 'muscle_groups',
    restDuration: 'rest_duration',
    heartRate: 'heart_rate'
  };
  const res = {};
  for (let k in obj) {
    if (k === 'isPast' || k === 'manualDuration') continue;
    res[map[k] || k] = obj[k];
  }
  return res;
}

function toJSObj(obj) {
  const map = {
    session_id: 'sessionId',
    exercise_id: 'exerciseId',
    machine_id: 'machineId',
    muscle_groups: 'muscleGroups',
    rest_duration: 'restDuration',
    heart_rate: 'heartRate'
  };
  const res = {};
  for (let k in obj) {
    res[map[k] || k] = obj[k];
  }
  return res;
}

// --- SYNC ENGINE ---
// Pull data from Supabase into LocalStorage to keep app.js synchronous
async function syncFromSupabase() {
  if (!currentUser) return;
  
  const spinner = document.getElementById('sync-overlay');
  if (spinner) spinner.style.display = 'flex';
  showToast('Synchronisation...', 'info');
  
  try {
    const [
      { data: profile },
      { data: sessions },
      { data: sets },
      { data: metrics },
      { data: machines },
      { data: exercises }
    ] = await Promise.all([
      supabaseClient.from('profiles').select('*').eq('user_id', currentUser.id).single(),
      supabaseClient.from('sessions').select('*').eq('user_id', currentUser.id),
      supabaseClient.from('sets').select('*').eq('user_id', currentUser.id),
      supabaseClient.from('metrics').select('*').eq('user_id', currentUser.id),
      supabaseClient.from('machines').select('*').eq('user_id', currentUser.id),
      supabaseClient.from('exercises').select('*').eq('user_id', currentUser.id),
    ]);
    
    // Merge helper for robust offline sync: keeps local data that hasn't successfully pushed yet
    const mergeData = (localKey, remoteData) => {
      const remoteArr = remoteData.map(toJSObj);
      const localArr = DB._get ? DB._get(localKey) : (JSON.parse(localStorage.getItem(localKey)) || []);
      const remoteIds = new Set(remoteArr.map(i => i.id));
      return [...remoteArr, ...localArr.filter(i => !remoteIds.has(i.id))];
    };

    // Save to LocalStorage intelligently
    if (profile) localStorage.setItem(DB.KEYS.profile, JSON.stringify(toJSObj(profile)));
    if (sessions) localStorage.setItem(DB.KEYS.sessions, JSON.stringify(mergeData(DB.KEYS.sessions, sessions)));
    if (sets) localStorage.setItem(DB.KEYS.sets, JSON.stringify(mergeData(DB.KEYS.sets, sets)));
    if (metrics) localStorage.setItem(DB.KEYS.metrics, JSON.stringify(mergeData(DB.KEYS.metrics, metrics)));
    if (machines && machines.length) localStorage.setItem(DB.KEYS.machines, JSON.stringify(mergeData(DB.KEYS.machines, machines)));
    if (exercises && exercises.length) localStorage.setItem(DB.KEYS.exercises, JSON.stringify(mergeData(DB.KEYS.exercises, exercises)));
    
    await uploadUnsyncedData({ profile, sessions, sets, metrics, machines, exercises });

    showToast('Données synchronisées', 'success');
  } catch(e) {
    console.error("Erreur de synchro:", e);
    showToast('Erreur de synchronisation cloud', 'danger');
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

async function uploadUnsyncedData(remoteData) {
  if (!currentUser) return;
  const { profile, sessions, sets, metrics, machines, exercises } = remoteData;
  
  const pushMissing = async (localKey, remoteArr, table) => {
    const localArr = JSON.parse(localStorage.getItem(localKey)) || [];
    const remoteIds = new Set((remoteArr || []).map(i => i.id));
    const missingLocal = localArr.filter(i => !remoteIds.has(i.id));
    
    for (const item of missingLocal) {
      await pushToSupabase(table, item);
    }
  };

  await pushMissing(DB.KEYS.sessions, sessions ? sessions.map(toJSObj) : [], 'sessions');
  await pushMissing(DB.KEYS.sets, sets ? sets.map(toJSObj) : [], 'sets');
  await pushMissing(DB.KEYS.metrics, metrics ? metrics.map(toJSObj) : [], 'metrics');
  await pushMissing(DB.KEYS.machines, machines ? machines.map(toJSObj) : [], 'machines');
  await pushMissing(DB.KEYS.exercises, exercises ? exercises.map(toJSObj) : [], 'exercises');
  
  const localProfile = JSON.parse(localStorage.getItem(DB.KEYS.profile)) || {};
  if (localProfile && Object.keys(localProfile).length > 0 && !profile) {
    await pushToSupabase('profiles', { ...localProfile, id: 'profile' });
  }
}

// Background push to Supabase
async function pushToSupabase(table, record) {
  if (!currentUser) return;
  try {
    if (!navigator.onLine) {
       console.warn(`[pushToSupabase] Appareil hors ligne. Données enregistrées localement uniquement.`);
       return;
    }
    // Convert JS object to DB schema
    const mappedRecord = toDBObj(record);
    // Always inject user_id for RLS
    const payload = { ...mappedRecord, user_id: currentUser.id };
    
    console.log(`[pushToSupabase] Sending to table ${table}:`, payload);
    
    const { data, error } = await supabaseClient
      .from(table)
      .upsert(payload, { onConflict: 'id' });
      
    if (error) {
      console.error(`Erreur Push Supabase [${table}]:`, error.message);
      showToast(`Erreur de sauvegarde: ${error.message}`, 'error');
    } else {
      console.log(`[pushToSupabase] Success ${table}`);
    }
  } catch(err) {
    console.error(`Exception in pushToSupabase [${table}]:`, err);
  }
}

async function deleteFromSupabase(table, id) {
  if (!currentUser) return;
  const { error } = await supabaseClient
    .from(table)
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id);
    
  if (error) console.error(`Erreur Delete Supabase [${table}]:`, error.message);
}

// Initialization trigger when page loads
window.addEventListener('DOMContentLoaded', () => {
    initAuth();
});

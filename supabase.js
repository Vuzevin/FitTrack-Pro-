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

// --- SYNC ENGINE ---
// Pull data from Supabase into LocalStorage to keep app.js synchronous
async function syncFromSupabase() {
  if (!currentUser) return;
  
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
    
    // Save to LocalStorage without triggering push
    if (profile) localStorage.setItem(DB.KEYS.profile, JSON.stringify(profile));
    if (sessions) localStorage.setItem(DB.KEYS.sessions, JSON.stringify(sessions));
    if (sets) localStorage.setItem(DB.KEYS.sets, JSON.stringify(sets));
    if (metrics) localStorage.setItem(DB.KEYS.metrics, JSON.stringify(metrics));
    if (machines && machines.length) localStorage.setItem(DB.KEYS.machines, JSON.stringify(machines));
    if (exercises && exercises.length) localStorage.setItem(DB.KEYS.exercises, JSON.stringify(exercises));
    
    showToast('Données synchronisées', 'success');
  } catch(e) {
    console.error("Erreur de synchro:", e);
    showToast('Erreur de synchronisation cloud', 'danger');
  }
}

// Background push to Supabase
async function pushToSupabase(table, record) {
  if (!currentUser) return;
  // Always inject user_id for RLS
  const payload = { ...record, user_id: currentUser.id };
  
  // Strip frontend-only flags that don't exist in SQL schema
  if (table === 'sessions') {
    delete payload.isPast;
    delete payload.manualDuration;
  }
  
  const { error } = await supabaseClient
    .from(table)
    .upsert(payload, { onConflict: 'id' });
    
  if (error) console.error(`Erreur Push Supabase [${table}]:`, error.message);
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

-- =============================================================================
-- SQL d'initialisation Supabase pour FitTrack Pro
-- Exécutez ce script dans l'éditeur SQL de votre projet Supabase
-- =============================================================================

-- =======================================
-- 1. CREATION DES TABLES
-- =======================================

-- Table profiles
CREATE TABLE public.profiles (
    id text PRIMARY KEY,
    user_id uuid REFERENCES auth.users NOT NULL,
    name text,
    age integer,
    height real,
    goal text,
    rest_duration integer
);

-- Table sessions
CREATE TABLE public.sessions (
    id text PRIMARY KEY,
    user_id uuid REFERENCES auth.users NOT NULL,
    sport text,
    date timestamp with time zone,
    duration integer,
    distance real,
    heart_rate integer,
    power integer,
    notes text,
    exercises text[],
    finished boolean
);

-- Table sets (séries)
CREATE TABLE public.sets (
    id text PRIMARY KEY,
    user_id uuid REFERENCES auth.users NOT NULL,
    session_id text,
    exercise_id text,
    reps real,
    weight real,
    timestamp timestamp with time zone
);

-- Table metrics (poids, imc, etc.)
CREATE TABLE public.metrics (
    id text PRIMARY KEY,
    user_id uuid REFERENCES auth.users NOT NULL,
    date timestamp with time zone,
    weight real,
    bmi real
);

-- Table machines
CREATE TABLE public.machines (
    id text PRIMARY KEY,
    user_id uuid REFERENCES auth.users NOT NULL,
    name text,
    muscle_groups text[],
    category text
);

-- Table exercises
CREATE TABLE public.exercises (
    id text PRIMARY KEY,
    user_id uuid REFERENCES auth.users NOT NULL,
    name text,
    machine_id text,
    category text
);

-- =======================================
-- 2. POLITIQUES DE SECURITE RLS
-- =======================================
-- Active la sécurité au niveau des lignes pour toutes les tables

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------
-- Policies pour `profiles`
CREATE POLICY "Les utilisateurs peuvent voir leur profil" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Les utilisateurs peuvent inserer leur profil" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Les utilisateurs peuvent modifier leur profil" ON public.profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Les utilisateurs peuvent supprimer leur profil" ON public.profiles FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------
-- Policies pour `sessions`
CREATE POLICY "Voir ses sessions" ON public.sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Inserer ses sessions" ON public.sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Modifier ses sessions" ON public.sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Supprimer ses sessions" ON public.sessions FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------
-- Policies pour `sets`
CREATE POLICY "Voir ses sets" ON public.sets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Inserer ses sets" ON public.sets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Modifier ses sets" ON public.sets FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Supprimer ses sets" ON public.sets FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------
-- Policies pour `metrics`
CREATE POLICY "Voir ses metrics" ON public.metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Inserer ses metrics" ON public.metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Modifier ses metrics" ON public.metrics FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Supprimer ses metrics" ON public.metrics FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------
-- Policies pour `machines`
CREATE POLICY "Voir ses machines" ON public.machines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Inserer ses machines" ON public.machines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Modifier ses machines" ON public.machines FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Supprimer ses machines" ON public.machines FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------
-- Policies pour `exercises`
CREATE POLICY "Voir ses exercises" ON public.exercises FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Inserer ses exercises" ON public.exercises FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Modifier ses exercises" ON public.exercises FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Supprimer ses exercises" ON public.exercises FOR DELETE USING (auth.uid() = user_id);

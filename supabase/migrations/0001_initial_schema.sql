-- =====================================================================
-- ANKORA — Schema initial
-- Migration 0001 : extensions, enums, tables, indexes, triggers
-- Region cible : EU Frankfurt (eu-central-1)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type user_role as enum ('admin', 'client');

create type audit_status as enum (
  'queued',
  'scraping',
  'extracting',
  'querying',
  'analyzing',
  'scoring',
  'done',
  'failed'
);

create type tech_category as enum (
  'foundations',
  'geo_triptych',
  'structured_data',
  'content',
  'authority'
);

create type query_category as enum (
  'branded',
  'service',
  'comparative'
);

create type ai_provider as enum (
  'openai',
  'anthropic',
  'perplexity',
  'gemini'
);

create type sentiment_label as enum (
  'positive',
  'neutral',
  'negative'
);

create type recommendation_priority as enum (
  'quick_win',
  'medium',
  'long_term'
);

-- ---------------------------------------------------------------------
-- Table : profiles
-- Profil utilisateur lie a auth.users. En V0, seul "admin" existe.
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role user_role not null default 'admin',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Profil utilisateur. Lie 1-1 avec auth.users.';

-- ---------------------------------------------------------------------
-- Table : audits
-- Entite racine. Un audit = une URL analysee a un instant T.
-- ---------------------------------------------------------------------
create table public.audits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  url text not null,
  url_normalized text not null,         -- pour dedup et detection re-audit
  language text,                        -- detecte au scraping (fr, en, ...)
  status audit_status not null default 'queued',
  progress smallint not null default 0 check (progress between 0 and 100),
  current_step text,
  error_message text,
  -- Liste optionnelle de concurrents fournis manuellement par l'utilisateur
  manual_competitors text[] default '{}',
  -- Ville/zone geographique pour les prompts geolocalises
  geo_target text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_audits_user_id on public.audits(user_id);
create index idx_audits_status on public.audits(status);
create index idx_audits_url_normalized on public.audits(url_normalized);
create index idx_audits_created_at on public.audits(created_at desc);

comment on table public.audits is 'Audit GEO complet. 1 audit = 1 URL a un instant T.';

-- ---------------------------------------------------------------------
-- Table : audit_business_info
-- Donnees extraites du site (1-1 avec audit).
-- ---------------------------------------------------------------------
create table public.audit_business_info (
  audit_id uuid primary key references public.audits(id) on delete cascade,
  brand_name text not null,
  -- Variantes orthographiques pour la detection robuste de mention
  brand_aliases text[] not null default '{}',
  industry text,
  services jsonb not null default '[]'::jsonb,
  geo_zone text,
  -- Concurrents detectes automatiquement par le scraping + analyse
  detected_competitors text[] not null default '{}',
  -- Tout le brut renvoye par le LLM d'extraction (pour debug et re-traitement)
  raw_extraction jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_business_info is 'Donnees business extraites du site (LLM).';

-- ---------------------------------------------------------------------
-- Table : audit_technical
-- Resultats de l'audit technique (5 categories x 20 pts = 100).
-- 1 ligne par couple (audit, categorie).
-- ---------------------------------------------------------------------
create table public.audit_technical (
  audit_id uuid not null references public.audits(id) on delete cascade,
  category tech_category not null,
  -- Detail de chaque check : [{id, label, status, points_earned, points_max, evidence, recommendation}]
  checks jsonb not null default '[]'::jsonb,
  score smallint not null check (score between 0 and 20),
  created_at timestamptz not null default now(),
  primary key (audit_id, category)
);

comment on table public.audit_technical is 'Audit technique 5 categories. score /20 chacune.';

-- ---------------------------------------------------------------------
-- Table : queries
-- Requetes generees pour l'AI Visibility Tracking.
-- ---------------------------------------------------------------------
create table public.queries (
  id uuid primary key default uuid_generate_v4(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  text text not null,
  category query_category not null,
  position smallint not null,
  created_at timestamptz not null default now()
);

create index idx_queries_audit_id on public.queries(audit_id);
create index idx_queries_category on public.queries(audit_id, category);

comment on table public.queries is 'Requetes generees par LLM pour le tracking IA (30 par audit).';

-- ---------------------------------------------------------------------
-- Table : ai_responses
-- 1 ligne par couple (query, provider). 30 queries x 4 providers = 120/audit.
-- ---------------------------------------------------------------------
create table public.ai_responses (
  id uuid primary key default uuid_generate_v4(),
  query_id uuid not null references public.queries(id) on delete cascade,
  provider ai_provider not null,
  model text not null,                  -- ex: "gpt-4o-2024-08-06"
  raw_response text,
  sources jsonb default '[]'::jsonb,    -- citations (Perplexity, Gemini)
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric(10, 6),
  latency_ms integer,
  error_message text,
  created_at timestamptz not null default now(),
  unique (query_id, provider)
);

create index idx_ai_responses_query_id on public.ai_responses(query_id);
create index idx_ai_responses_provider on public.ai_responses(provider);

comment on table public.ai_responses is 'Reponses brutes des 4 IA pour chaque requete.';

-- ---------------------------------------------------------------------
-- Table : ai_response_analysis
-- Analyse automatique de chaque reponse (mention, sentiment, ...).
-- ---------------------------------------------------------------------
create table public.ai_response_analysis (
  response_id uuid primary key references public.ai_responses(id) on delete cascade,
  brand_mentioned boolean not null default false,
  -- Position de la marque dans la reponse (1 = premiere citee, null si non mentionnee)
  mention_position smallint,
  -- Snippet contextuel autour de la mention (debug)
  mention_context text,
  -- Citation explicite avec lien/source vers le site de la marque
  brand_citation_present boolean not null default false,
  sentiment sentiment_label,
  competitors_cited text[] not null default '{}',
  sources_cited text[] not null default '{}',
  raw_analysis jsonb,                   -- pour debug
  analyzed_at timestamptz not null default now()
);

comment on table public.ai_response_analysis is 'Analyse de chaque reponse IA : mention, sentiment, sources.';

-- ---------------------------------------------------------------------
-- Table : audit_scores
-- Scores agreges (1-1 avec audit).
-- Ponderation validee phase 0 : technique 40%, visibility 60%.
-- ---------------------------------------------------------------------
create table public.audit_scores (
  audit_id uuid primary key references public.audits(id) on delete cascade,
  technical_score smallint not null check (technical_score between 0 and 100),
  visibility_score smallint not null check (visibility_score between 0 and 100),
  global_score smallint not null check (global_score between 0 and 100),
  -- Score par provider IA : {openai: 65, anthropic: 70, perplexity: 45, gemini: 80}
  visibility_per_provider jsonb not null default '{}'::jsonb,
  -- Mention rate (textuelle stricte) et citation rate (lien/source) — 2 metriques separees
  mention_rate numeric(5, 2),           -- 0 a 100 (%)
  citation_rate numeric(5, 2),          -- 0 a 100 (%)
  -- Top concurrent qui ressort le plus
  top_competitor text,
  computed_at timestamptz not null default now()
);

comment on table public.audit_scores is 'Scores agreges. Global = 0.4*technique + 0.6*visibility.';

-- ---------------------------------------------------------------------
-- Table : audit_recommendations
-- Recommandations actionnables priorisees.
-- ---------------------------------------------------------------------
create table public.audit_recommendations (
  id uuid primary key default uuid_generate_v4(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  priority recommendation_priority not null,
  category text not null,               -- "robots.txt", "schema", "content", ...
  title text not null,
  description text not null,
  impact_score smallint not null check (impact_score between 1 and 10),
  position smallint not null default 0, -- ordre d'affichage dans le rapport
  created_at timestamptz not null default now()
);

create index idx_recommendations_audit on public.audit_recommendations(audit_id, priority, position);

comment on table public.audit_recommendations is 'Recommandations priorisees (quick_win / medium / long_term).';

-- ---------------------------------------------------------------------
-- Table : api_usage
-- Tracking des couts API pour le cap mensuel.
-- ---------------------------------------------------------------------
create table public.api_usage (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete set null,
  audit_id uuid references public.audits(id) on delete set null,
  provider ai_provider not null,
  model text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  cost_eur numeric(10, 6) not null default 0,
  request_type text,                    -- "extraction", "queries_gen", "visibility", "analysis"
  created_at timestamptz not null default now()
);

create index idx_api_usage_user_month on public.api_usage(user_id, created_at desc);
create index idx_api_usage_created_at on public.api_usage(created_at desc);

comment on table public.api_usage is 'Tracking granulaire des couts API. Source de verite pour les caps.';

-- ---------------------------------------------------------------------
-- Vue : api_usage_monthly
-- Aggregation des couts par mois et utilisateur — utilisee pour le cap.
-- ---------------------------------------------------------------------
create or replace view public.api_usage_monthly as
select
  user_id,
  date_trunc('month', created_at) as month,
  count(*) as call_count,
  sum(tokens_in) as total_tokens_in,
  sum(tokens_out) as total_tokens_out,
  sum(cost_usd) as total_cost_usd,
  sum(cost_eur) as total_cost_eur
from public.api_usage
where user_id is not null
group by user_id, date_trunc('month', created_at);

comment on view public.api_usage_monthly is 'Couts API agreges par mois. Utilise pour le cap budget.';

-- ---------------------------------------------------------------------
-- Triggers : updated_at automatique
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger audits_set_updated_at
  before update on public.audits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Trigger : creation auto du profile au signup auth
-- Quand un user s'inscrit via Supabase Auth, on cree automatiquement
-- la ligne dans public.profiles avec role 'admin' par defaut (V0).
-- En V2 on changera le default a 'client'.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    'admin'::user_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- ANKORA — Politiques de securite RLS
-- Migration 0002 : Row Level Security sur toutes les tables
--
-- Principe :
--   - Chaque utilisateur ne voit que SES audits (via user_id).
--   - Toutes les tables filles heritent de la regle via l'audit_id.
--   - Le service_role (cote serveur) bypass automatiquement toutes les RLS.
--   - En V0 (admin unique = toi), ces policies sont defensives mais pretes
--     pour le multi-tenant en V2.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Activation de RLS sur toutes les tables
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.audits enable row level security;
alter table public.audit_business_info enable row level security;
alter table public.audit_technical enable row level security;
alter table public.queries enable row level security;
alter table public.ai_responses enable row level security;
alter table public.ai_response_analysis enable row level security;
alter table public.audit_scores enable row level security;
alter table public.audit_recommendations enable row level security;
alter table public.api_usage enable row level security;

-- ---------------------------------------------------------------------
-- profiles : un user voit/modifie son propre profil
-- ---------------------------------------------------------------------
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------
-- audits : un user voit/cree/met-a-jour ses propres audits
-- ---------------------------------------------------------------------
create policy "audits_select_own"
  on public.audits
  for select
  using (auth.uid() = user_id);

create policy "audits_insert_own"
  on public.audits
  for insert
  with check (auth.uid() = user_id);

create policy "audits_update_own"
  on public.audits
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "audits_delete_own"
  on public.audits
  for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Helper : un audit appartient au user courant ?
-- Factorise les checks pour les tables filles.
-- ---------------------------------------------------------------------
create or replace function public.user_owns_audit(p_audit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.audits
    where id = p_audit_id and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- audit_business_info : visible si le user possede l'audit parent
-- ---------------------------------------------------------------------
create policy "business_info_select_own"
  on public.audit_business_info
  for select
  using (public.user_owns_audit(audit_id));

-- ---------------------------------------------------------------------
-- audit_technical
-- ---------------------------------------------------------------------
create policy "technical_select_own"
  on public.audit_technical
  for select
  using (public.user_owns_audit(audit_id));

-- ---------------------------------------------------------------------
-- queries
-- ---------------------------------------------------------------------
create policy "queries_select_own"
  on public.queries
  for select
  using (public.user_owns_audit(audit_id));

-- ---------------------------------------------------------------------
-- ai_responses : double check via la query parente
-- ---------------------------------------------------------------------
create policy "ai_responses_select_own"
  on public.ai_responses
  for select
  using (
    exists (
      select 1
      from public.queries q
      where q.id = ai_responses.query_id
        and public.user_owns_audit(q.audit_id)
    )
  );

-- ---------------------------------------------------------------------
-- ai_response_analysis : via response -> query -> audit
-- ---------------------------------------------------------------------
create policy "ai_response_analysis_select_own"
  on public.ai_response_analysis
  for select
  using (
    exists (
      select 1
      from public.ai_responses r
      join public.queries q on q.id = r.query_id
      where r.id = ai_response_analysis.response_id
        and public.user_owns_audit(q.audit_id)
    )
  );

-- ---------------------------------------------------------------------
-- audit_scores
-- ---------------------------------------------------------------------
create policy "scores_select_own"
  on public.audit_scores
  for select
  using (public.user_owns_audit(audit_id));

-- ---------------------------------------------------------------------
-- audit_recommendations
-- ---------------------------------------------------------------------
create policy "recommendations_select_own"
  on public.audit_recommendations
  for select
  using (public.user_owns_audit(audit_id));

-- ---------------------------------------------------------------------
-- api_usage : un user voit son propre usage
-- ---------------------------------------------------------------------
create policy "api_usage_select_own"
  on public.api_usage
  for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Note importante :
-- Les ecritures sur les tables filles (business_info, technical, queries,
-- ai_responses, etc.) se font cote SERVEUR via le client admin (service_role)
-- qui bypass RLS. C'est l'orchestrateur Inngest qui ecrit ces donnees
-- pendant le pipeline d'audit, pas le user directement.
-- Pour cette raison on ne cree pas de policies INSERT/UPDATE/DELETE sur
-- ces tables — seules les policies SELECT sont necessaires.
-- =====================================================================

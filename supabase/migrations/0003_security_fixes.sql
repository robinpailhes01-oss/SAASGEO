-- =====================================================================
-- ANKORA — Corrections securite suite aux advisors Supabase
-- Migration 0003 :
--   1. View api_usage_monthly : forcer security_invoker (ERROR linter)
--   2. Fonction set_updated_at : search_path immutable (WARN)
--   3. Fonctions handle_new_user et user_owns_audit : revoke execute
--      pour anon et authenticated (WARN — les fonctions sont utilisees
--      en interne par les triggers et RLS, pas exposees en RPC public).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Recreer la vue api_usage_monthly avec security_invoker
-- ---------------------------------------------------------------------
drop view if exists public.api_usage_monthly;

create view public.api_usage_monthly
with (security_invoker = true) as
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

comment on view public.api_usage_monthly is
  'Couts API agreges par mois (security_invoker — applique RLS du caller).';

-- ---------------------------------------------------------------------
-- 2. Fixer search_path mutable sur set_updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Revoke execute sur les fonctions internes
-- handle_new_user : trigger interne sur auth.users, ne doit jamais
-- etre appelee en RPC (sinon contournement de la creation profile).
-- user_owns_audit : utilisee par les RLS policies, pas en RPC direct.
-- RLS eval continue de fonctionner (postgres execute la fonction
-- meme sans grant pour le caller via SECURITY DEFINER).
-- ---------------------------------------------------------------------
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.user_owns_audit(uuid) from anon, authenticated, public;

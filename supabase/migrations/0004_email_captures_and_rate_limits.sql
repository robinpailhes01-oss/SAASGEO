-- =====================================================================
-- Bloc 5 : email captures (leadgen) + rate limiting (anti-spam)
-- =====================================================================

-- Table : email_captures
create table public.email_captures (
  id uuid primary key default uuid_generate_v4(),
  audit_id uuid references public.audits(id) on delete set null,
  email text not null,
  source text default 'report_page',
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_email_captures_audit on public.email_captures(audit_id);
create index idx_email_captures_email on public.email_captures(email);
create index idx_email_captures_created on public.email_captures(created_at desc);

comment on table public.email_captures is 'Leads captures sur les rapports d''audit publics.';

alter table public.email_captures enable row level security;

-- Table : rate_limits
create table public.rate_limits (
  id uuid primary key default uuid_generate_v4(),
  ip_address inet not null,
  action text not null,
  audit_id uuid references public.audits(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_rate_limits_ip_action_recent
  on public.rate_limits(ip_address, action, created_at desc);

comment on table public.rate_limits is 'Tracking par IP pour anti-spam (rate limiting).';

alter table public.rate_limits enable row level security;

-- Fonction : check_rate_limit (server-side via service_role uniquement)
create or replace function public.check_rate_limit(
  p_ip inet,
  p_action text,
  p_max integer,
  p_window_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.rate_limits
  where ip_address = p_ip
    and action = p_action
    and created_at > now() - (p_window_minutes || ' minutes')::interval;
  return v_count >= p_max;
end;
$$;

revoke execute on function public.check_rate_limit(inet, text, integer, integer)
  from anon, authenticated, public;

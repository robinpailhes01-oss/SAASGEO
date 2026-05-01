-- =====================================================================
-- Bloc 5 Phase C : SELECT public sur audits (page rapport publique)
--
-- Brief Bloc 5 : "/audit/[id] PUBLIC + meta noindex". N'importe qui
-- avec le lien peut consulter le rapport — securise uniquement par
-- l'unguessabilite de l'UUID v4 (~122 bits d'entropie).
--
-- On ajoute une policy permissive de SELECT pour le role anon. Les
-- INSERT/UPDATE/DELETE restent reserves au proprietaire (policies
-- existantes "audits_*_own" inchangees).
--
-- Note securite : la table contient seulement url, url_normalized,
-- status, progress, current_step, error_message, completed_at, dates,
-- user_id (UUID non revelateur), language, geo_target, manual_competitors.
-- Aucune donnee sensible.
-- =====================================================================

create policy "audits_select_public"
  on public.audits
  for select
  to anon, authenticated
  using (true);

-- Realtime : il faut explicitement publier la table sur le canal
-- supabase_realtime pour que les UPDATE soient pousses aux clients.
alter publication supabase_realtime add table public.audits;

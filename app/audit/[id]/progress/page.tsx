// =====================================================================
// /audit/[id]/progress — page de progression publique.
//
// Server Component qui :
//   - valide l'UUID
//   - fetch initial de l'audit via service_role (bypass RLS, safe car
//     on ne renvoie que des champs non sensibles)
//   - 404 si l'audit n'existe pas
//   - rend <ProgressView /> qui prend le relais en client (Realtime +
//     polling)
//
// SEO : meta noindex stricte (page transitoire, n'a pas vocation à
// rester dans les SERP).
// =====================================================================

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/server";
import { ProgressView } from "@/components/progress/ProgressView";
import type { AuditStatusResponse } from "@/app/api/audits/[id]/status/route";

export const metadata: Metadata = {
  title: "Audit en cours — Ankora",
  robots: { index: false, follow: false },
};

// Désactive la mise en cache : la page doit toujours refléter l'état
// actuel de l'audit au moment du SSR initial.
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AuditProgressPage({
  params,
}: {
  params: { id: string };
}) {
  if (!UUID_RE.test(params.id)) notFound();

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("audits")
    .select(
      "id, url, status, progress, current_step, error_message, created_at, completed_at"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error || !data) notFound();

  // Fallback instant : si l'audit est DEJA termine au moment ou l'user
  // ouvre la page (cas frequent quand il revient apres avoir ferme
  // l'onglet, ou quand le backend a fini avant le SSR), on redirige
  // server-side directement vers le rapport. Pas de flash de page de
  // chargement, pas de countdown, pas de risque de polling rate.
  // status='failed' reste sur /progress pour afficher AuditFailedState.
  if (data.status === "done") {
    redirect(`/audit/${data.id}`);
  }

  return <ProgressView initialAudit={data satisfies AuditStatusResponse} />;
}

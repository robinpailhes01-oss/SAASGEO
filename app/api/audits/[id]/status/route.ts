// =====================================================================
// GET /api/audits/[id]/status — endpoint public de polling.
//
// Retourne le sous-ensemble des champs `audits` necessaires a la page
// de progression. Utilise pour :
//   - SSR initial via fetch interne (Phase C)
//   - Polling fallback toutes les 3s cote client (si Realtime n'est
//     pas configure ou se deconnecte)
//
// Securite : on utilise createAdminClient (service_role) pour bypass
// la RLS, mais on ne renvoie QUE des champs non sensibles. La table
// `audits` ne contient de toute facon aucune donnee privee critique
// (cf. migration 0005).
//
// L'endpoint accepte les requetes anon — c'est par design, conforme
// au brief Bloc 5 ("/audit/[id] PUBLIC").
// =====================================================================

import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/server";

export type AuditStatusResponse = {
  id: string;
  url: string;
  status: string;
  progress: number;
  current_step: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  // Validation UUID basique pour eviter les requetes parasites
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("audits")
    .select(
      "id, url, status, progress, current_step, error_message, created_at, completed_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Erreur de lecture de l'audit." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Audit introuvable." }, { status: 404 });
  }

  // CACHE-CONTROL : aucun cache. C'est un endpoint de POLLING TEMPS
  // REEL — chaque ms compte pour detecter la transition vers 'done'.
  // Avant : "public, max-age=1, stale-while-revalidate=2" -> Vercel
  // Edge / CDN servait du stale plusieurs secondes apres l'update DB,
  // ce qui retardait (voire empechait) la redirection cote client. Bug
  // observe sur audit bceb51bc : status='done' en DB mais le polling
  // recevait encore une vieille reponse cachee. Fix : desactivation
  // totale du cache.
  return NextResponse.json(data satisfies AuditStatusResponse, {
    headers: {
      "cache-control": "private, no-store, no-cache, must-revalidate",
      pragma: "no-cache",
    },
  });
}

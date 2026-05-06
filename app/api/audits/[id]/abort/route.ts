// =====================================================================
// POST /api/audits/[id]/abort — annule un audit en cours.
//
// Utilise par le bouton "Relancer l'audit" du frontend quand l'audit
// est bloque depuis plus de 5 minutes (cf. ProgressView SAFETY_*).
//
// Marque l'audit `failed` avec un error_message clair et retourne
// 200. La fonction Inngest associee continue de tourner jusqu'a son
// terme — on n'a pas de mecanique d'interruption en cours de run
// (limite SDK Inngest), mais le frontend ne pollera plus et
// l'utilisateur peut relancer.
//
// Idempotent : si l'audit est deja terminal (done/failed), on retourne
// 200 sans modification.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ErrorCode = "invalid_id" | "audit_not_found" | "server_error";

function err(status: number, code: ErrorCode, message: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!UUID_RE.test(params.id)) {
    return err(400, "invalid_id", "Identifiant d'audit invalide.");
  }

  const sb = createAdminClient();
  const { data: audit, error: selErr } = await sb
    .from("audits")
    .select("id, status")
    .eq("id", params.id)
    .maybeSingle();

  if (selErr || !audit) {
    return err(404, "audit_not_found", "Audit introuvable.");
  }

  // Idempotent : audits deja terminaux -> 200 sans toucher.
  if (audit.status === "done" || audit.status === "failed") {
    return NextResponse.json({ ok: true, already_terminal: true });
  }

  const { error: updErr } = await sb
    .from("audits")
    .update({
      status: "failed",
      error_message:
        "Audit annulé par l'utilisateur après un délai prolongé. Vous pouvez relancer une nouvelle analyse.",
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (updErr) {
    console.error(`[abort] update failed : ${updErr.message}`);
    return err(500, "server_error", "Erreur d'enregistrement, réessayez.");
  }

  return NextResponse.json({ ok: true });
}

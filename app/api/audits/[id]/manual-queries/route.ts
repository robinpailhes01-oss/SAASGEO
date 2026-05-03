// =====================================================================
// /api/audits/[id]/manual-queries — requetes ajoutees manuellement par
// le client apres avoir vu son rapport.
//
// GET  : etat actuel (count, queries + analyses, pending boolean).
//        Utilise par le composant ManualQueries pour afficher l'existant
//        au mount et pour le polling 3s pendant le processing.
//
// POST : ajoute jusqu'a (3 - count_actuel) queries.
//        Body : { queries: string[] (1..3) }
//        - Validation UUID + audit existe + status='done'
//        - Anti-stacking : count + nouvelles <= MANUAL_QUERIES_MAX
//        - Insert source='user', positions = max+1..N
//        - Trigger Inngest 'audit/manual-queries-added'
//        - Returns 202 { ok, count_added, total_count }
//
// Couts : 3 queries x 4 IA + analyses Haiku = ~0.08 € par audit.
// Marginal, gratuit en MVP. Le rate limit (10/heure/IP) protege contre
// les scripts.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/security/ip";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getManualQueries } from "@/lib/report/get-manual-queries";
import { MANUAL_QUERIES_MAX } from "@/lib/report/types";

type ErrorCode =
  | "invalid_id"
  | "invalid_body"
  | "invalid_query"
  | "audit_not_found"
  | "audit_not_done"
  | "limit_reached"
  | "rate_limited"
  | "server_error";

function err(status: number, code: ErrorCode, message: string) {
  return NextResponse.json({ error: message, code }, { status });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QUERY_MIN = 5;
const QUERY_MAX = 200;

// ---------------------------------------------------------------------
// GET — etat des manual queries
// ---------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!UUID_RE.test(params.id)) {
    return err(400, "invalid_id", "Identifiant d'audit invalide.");
  }
  const payload = await getManualQueries(params.id);
  if (!payload) {
    return err(404, "audit_not_found", "Audit introuvable.");
  }
  return NextResponse.json(payload);
}

// ---------------------------------------------------------------------
// POST — ajout d'une serie de queries manuelles
// ---------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!UUID_RE.test(params.id)) {
    return err(400, "invalid_id", "Identifiant d'audit invalide.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid_body", "Corps de requête invalide.");
  }
  const queriesRaw = (body as { queries?: unknown })?.queries;
  if (!Array.isArray(queriesRaw) || queriesRaw.length === 0) {
    return err(
      400,
      "invalid_body",
      "Le champ 'queries' doit être un tableau non vide."
    );
  }
  if (queriesRaw.length > MANUAL_QUERIES_MAX) {
    return err(
      400,
      "invalid_body",
      `Vous pouvez ajouter au maximum ${MANUAL_QUERIES_MAX} questions.`
    );
  }
  // Normalisation + validation par item
  const queries: string[] = [];
  for (const q of queriesRaw) {
    if (typeof q !== "string") {
      return err(400, "invalid_query", "Chaque question doit être une chaîne.");
    }
    const trimmed = q.trim();
    if (trimmed.length < QUERY_MIN || trimmed.length > QUERY_MAX) {
      return err(
        400,
        "invalid_query",
        `Chaque question doit faire entre ${QUERY_MIN} et ${QUERY_MAX} caractères.`
      );
    }
    queries.push(trimmed);
  }

  // Rate limit modere (anti-script, pas anti-user)
  const ip = getClientIp(req);
  const decision = await enforceRateLimit({
    ip,
    action: "manual_queries_submit",
    max: 10,
    windowMinutes: 60,
    auditId: params.id,
  });
  if (!decision.allowed) {
    return err(
      decision.reason === "rate_limited" ? 429 : 500,
      decision.reason === "rate_limited" ? "rate_limited" : "server_error",
      decision.message ?? "Trop de tentatives, réessayez plus tard."
    );
  }

  const sb = createAdminClient();

  // Verif audit existe + status='done' (on n'autorise PAS pendant le
  // pipeline principal pour eviter les conditions de course).
  const { data: audit } = await sb
    .from("audits")
    .select("id, status")
    .eq("id", params.id)
    .maybeSingle();
  if (!audit) {
    return err(404, "audit_not_found", "Audit introuvable.");
  }
  if (audit.status !== "done") {
    return err(
      409,
      "audit_not_done",
      "L'audit n'est pas encore terminé — patientez quelques secondes."
    );
  }

  // Anti-stacking : combien de manual queries existent deja ?
  const { count: existingCount } = await sb
    .from("queries")
    .select("id", { count: "exact", head: true })
    .eq("audit_id", params.id)
    .eq("source", "user");
  const current = existingCount ?? 0;
  const remaining = MANUAL_QUERIES_MAX - current;
  if (remaining <= 0) {
    return err(
      409,
      "limit_reached",
      `Limite atteinte : ${MANUAL_QUERIES_MAX} questions personnalisées maximum par audit.`
    );
  }
  const toInsert = queries.slice(0, remaining);

  // Position de depart : max(position) + 1
  const { data: maxRow } = await sb
    .from("queries")
    .select("position")
    .eq("audit_id", params.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const startPosition = (maxRow?.position ?? 0) + 1;

  // Insert avec source='user', category='service' par defaut (les manual
  // queries sont generalement orientees service, c'est neutre).
  const rows = toInsert.map((text, i) => ({
    audit_id: params.id,
    text,
    category: "service" as const,
    source: "user",
    position: startPosition + i,
  }));
  const { data: inserted, error } = await sb
    .from("queries")
    .insert(rows)
    .select("id");
  if (error || !inserted) {
    console.error(
      `[manual-queries] insert failed : ${error?.message ?? "no data"}`
    );
    return err(500, "server_error", "Erreur d'enregistrement, réessayez.");
  }

  // Trigger Inngest pour le mini-pipeline visibility-only
  try {
    await inngest.send({
      name: "audit/manual-queries-added",
      data: {
        audit_id: params.id,
        query_ids: inserted.map((r) => r.id),
      },
    });
  } catch (e) {
    console.error(
      `[manual-queries] inngest.send failed : ${e instanceof Error ? e.message : String(e)}`
    );
    // Les rows sont inserees, on ne rollback pas — un retry du
    // processing peut etre fait manuellement si besoin. Mais on signale
    // au client que le processing pourrait ne pas demarrer.
    return NextResponse.json(
      {
        ok: true,
        count_added: inserted.length,
        total_count: current + inserted.length,
        warning: "Questions enregistrées mais l'analyse n'a pas pu démarrer.",
      },
      { status: 202 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      count_added: inserted.length,
      total_count: current + inserted.length,
    },
    { status: 202 }
  );
}

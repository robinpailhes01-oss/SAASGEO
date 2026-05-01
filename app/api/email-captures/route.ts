// =====================================================================
// POST /api/email-captures — capture un email lie a un audit.
//
// Body : { email: string, audit_id: string, source?: string }
// Response succes : { ok: true }
// Response erreur : { error: string, code: string }
//
// Flow :
//   1. Valide le body (email regex pragmatique + audit_id UUID v4)
//   2. Verifie le rate limit IP (5 captures/heure pour limiter le bruit)
//   3. Insert dans email_captures (RLS bypass via service_role) avec
//      ip_address + user_agent pour audit ulterieur
//   4. Returns 200 — l'envoi reel d'email viendra en Phase E (Resend)
//
// Codes erreur stables :
//   - invalid_body     : JSON corrompu
//   - invalid_email    : format email invalide
//   - invalid_audit_id : UUID malforme
//   - rate_limited     : trop de captures depuis cette IP
//   - server_error     : erreur DB
// =====================================================================

import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/security/ip";
import { enforceRateLimit } from "@/lib/security/rate-limit";

type ErrorCode =
  | "invalid_body"
  | "invalid_email"
  | "invalid_audit_id"
  | "rate_limited"
  | "server_error";

function err(status: number, code: ErrorCode, message: string) {
  return NextResponse.json({ error: message, code }, { status });
}

// Regex email pragmatique. On valide cote serveur un format de base
// (presence de @, point dans le domaine, pas d'espaces) — la validation
// definitive vient de l'envoi reel en Phase E.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTION_EMAIL_CAPTURE = "email_capture";

export async function POST(req: NextRequest) {
  // 1. Body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid_body", "Corps de requête invalide.");
  }
  if (!body || typeof body !== "object") {
    return err(400, "invalid_body", "Corps de requête invalide.");
  }
  const { email, audit_id, source } = body as Record<string, unknown>;

  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return err(400, "invalid_email", "Adresse email invalide.");
  }
  if (typeof audit_id !== "string" || !UUID_RE.test(audit_id)) {
    return err(400, "invalid_audit_id", "Identifiant d'audit invalide.");
  }

  // 2. Rate limit (5 captures/heure/IP)
  const ip = getClientIp(req);
  const decision = await enforceRateLimit({
    ip,
    action: ACTION_EMAIL_CAPTURE,
    max: 5,
    windowMinutes: 60,
    auditId: audit_id,
  });
  if (!decision.allowed) {
    return err(
      decision.reason === "rate_limited" ? 429 : 500,
      decision.reason === "rate_limited" ? "rate_limited" : "server_error",
      decision.message ?? "Trop de tentatives, réessayez plus tard."
    );
  }

  // 3. Insert
  const sb = createAdminClient();
  const { error } = await sb.from("email_captures").insert({
    email: email.trim().toLowerCase(),
    audit_id,
    source: typeof source === "string" ? source.slice(0, 64) : "report_inline",
    ip_address: ip,
    user_agent: req.headers.get("user-agent")?.slice(0, 256) ?? null,
  });

  if (error) {
    console.error(`[email-captures] insert failed : ${error.message}`);
    return err(500, "server_error", "Erreur d'enregistrement, réessayez.");
  }

  return NextResponse.json({ ok: true });
}

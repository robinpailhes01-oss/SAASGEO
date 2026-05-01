// =====================================================================
// POST /api/audits — cree un audit et trigger Inngest.
//
// Body : { url: string, geo_target?: string, captcha_token?: string }
// Response succes : { audit_id: string, status: "queued" }
// Response erreur : { error: string, code: string, ... }
//
// Flow :
//   1. Valide l'input (URL stricte anti-SSRF + verif format)
//   2. Verifie le captcha hCaptcha (mode degrade silencieux si non config)
//   3. Verifie le rate limit IP (3 audits/heure/IP par defaut)
//   4. Verifie le budget mensuel API
//   5. Cree la ligne audits Supabase (status=queued)
//   6. Send event "audit/requested" a Inngest
//   7. Returns audit_id immediatement (l'audit tourne en background)
//
// Codes erreur stables (champ `code`) — utilises par le front pour
// router vers un message specifique :
//   - invalid_body          : JSON corrompu
//   - invalid_url           : URL non parsable, schema interdit, IP privee...
//   - captcha_required      : captcha actif et token absent / invalide
//   - rate_limited          : quota IP atteint
//   - budget_exceeded       : cap mensuel API atteint
//   - server_error          : erreur DB ou Inngest
// =====================================================================

import { NextRequest, NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { createAudit } from "@/lib/ai/persistence";
import { ensureBudgetAvailable, BudgetExceededError } from "@/lib/ai/budget-guard";
import { getClientIp } from "@/lib/security/ip";
import { validateAuditUrl } from "@/lib/security/url-validator";
import { enforceRateLimit, ACTION_AUDIT_SUBMIT } from "@/lib/security/rate-limit";
import { verifyCaptcha } from "@/lib/security/captcha";

type ErrorCode =
  | "invalid_body"
  | "invalid_url"
  | "captcha_required"
  | "rate_limited"
  | "budget_exceeded"
  | "server_error";

// Helper de reponse erreur structure
function err(
  status: number,
  code: ErrorCode,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  // 1. Body JSON
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid_body", "Corps de requete JSON invalide.");
  }

  const { url, geo_target, captcha_token } = (body ?? {}) as {
    url?: unknown;
    geo_target?: unknown;
    captcha_token?: unknown;
  };

  // 2. Validation URL stricte (anti-SSRF, ports, protocoles, TLD)
  const urlCheck = validateAuditUrl(url);
  if (!urlCheck.ok) {
    return err(400, "invalid_url", urlCheck.message, {
      reason: urlCheck.reason,
    });
  }

  // 3. Captcha (mode degrade silencieux si HCAPTCHA_SECRET_KEY absente)
  const captcha = await verifyCaptcha(
    typeof captcha_token === "string" ? captcha_token : null,
    getClientIp(req)
  );
  if (!captcha.ok) {
    return err(400, "captcha_required", "Vérification anti-robot requise.", {
      reason: captcha.reason,
    });
  }

  // 4. Rate limit par IP (3 audits / heure / IP par defaut)
  const ip = getClientIp(req);
  const rateLimit = await enforceRateLimit({
    ip,
    action: ACTION_AUDIT_SUBMIT,
  });
  if (!rateLimit.allowed) {
    return err(429, "rate_limited", rateLimit.message, {
      retry_after_sec: rateLimit.retryAfterSec,
    });
  }

  // 5. Budget mensuel
  try {
    await ensureBudgetAvailable();
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      return err(429, "budget_exceeded", "Budget mensuel atteint.", {
        status: e.status,
      });
    }
    throw e;
  }

  // 6. Creation ligne audits — on utilise l'URL normalisee retournee par
  // le validateur (lowercase, slash final, fragment retire)
  const normalizedGeoTarget =
    typeof geo_target === "string" && geo_target.trim() ? geo_target.trim() : null;

  let audit_id: string;
  try {
    audit_id = await createAudit({
      url: urlCheck.url,
      geo_target: normalizedGeoTarget,
    });
  } catch (e) {
    return err(500, "server_error", "Impossible de créer l'audit.", {
      details: e instanceof Error ? e.message : String(e),
    });
  }

  // 7. Trigger Inngest
  try {
    await inngest.send({
      name: "audit/requested",
      data: { audit_id, url: urlCheck.url, geo_target: normalizedGeoTarget },
    });
  } catch (e) {
    console.error("[api/audits] inngest.send failed :", e);
    return NextResponse.json(
      {
        error:
          "Audit cree mais l'orchestrateur Inngest est inaccessible. Verifie que 'npx inngest-cli@latest dev' tourne en local.",
        code: "server_error",
        audit_id,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ audit_id, status: "queued" }, { status: 202 });
}

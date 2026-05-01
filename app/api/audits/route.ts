// =====================================================================
// POST /api/audits — cree un audit et trigger Inngest.
//
// Body : { url: string, geo_target?: string }
// Response : { audit_id: string }
//
// Flow :
//   1. Valide l'input (URL bien formee)
//   2. Cree la ligne audits Supabase (status=queued)
//   3. Send event "audit/requested" a Inngest
//   4. Returns audit_id immediatement (l'audit tourne en background)
//
// Le frontend (Bloc 5) ecoute Supabase Realtime sur audits.id pour
// la barre de progression live.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { createAudit } from "@/lib/ai/persistence";
import { ensureBudgetAvailable, BudgetExceededError } from "@/lib/ai/budget-guard";

const RequestSchema = z.object({
  url: z.string().url(),
  geo_target: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { url, geo_target } = parsed.data;

  // Check budget AVANT de creer l'audit row (evite les audits orphelins)
  try {
    await ensureBudgetAvailable();
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      return NextResponse.json(
        {
          error: "Budget mensuel atteint",
          status: e.status,
        },
        { status: 429 }
      );
    }
    throw e;
  }

  // Cree la ligne audits (status=queued)
  let audit_id: string;
  try {
    audit_id = await createAudit({ url, geo_target });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Impossible de creer l'audit",
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }

  // Trigger Inngest
  try {
    await inngest.send({
      name: "audit/requested",
      data: { audit_id, url, geo_target },
    });
  } catch (e) {
    console.error("[api/audits] inngest.send failed :", e);
    return NextResponse.json(
      {
        error: "Audit cree mais l'orchestrateur Inngest est inaccessible. Verifie que 'npx inngest-cli@latest dev' tourne en local.",
        audit_id,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ audit_id, status: "queued" }, { status: 202 });
}

// =====================================================================
// Endpoint Inngest : permet au serveur Inngest (dev local OU cloud
// prod) de decouvrir et invoquer nos fonctions.
//
// URL : http://localhost:3000/api/inngest
//
// En dev :
//   1. Lancer le serveur Inngest local : npx inngest-cli@latest dev
//   2. Lancer Next.js : pnpm dev
//   3. Inngest dev UI : http://localhost:8288
// =====================================================================

import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { runAuditFunction } from "@/inngest/functions/run-audit";
import { runManualQueriesFunction } from "@/inngest/functions/run-manual-queries";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAuditFunction, runManualQueriesFunction],
});

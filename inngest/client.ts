// =====================================================================
// Client Inngest pour Ankora.
//
// En dev : aucune cle requise, le serveur Inngest tourne en local
// (npx inngest-cli@latest dev). Le client s'y connecte par defaut.
//
// En prod : INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY (a configurer
// dans Vercel au deploiement Bloc 6 ou phase 2).
// =====================================================================

import { Inngest } from "inngest";

// Type des events emis dans Ankora (utilise pour le typing manuel
// dans les fonctions et le caller cote API route).
export interface AuditRequestedEvent {
  name: "audit/requested";
  data: {
    audit_id: string;
    url: string;
    geo_target?: string | null;
  };
}

export const inngest = new Inngest({
  id: "ankora",
});

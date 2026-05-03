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
    // Mots-cles client (max 10) injectes dans le prompt queries-gen
    // pour orienter les questions vers la vraie cible. Optionnel.
    keywords?: string[];
  };
}

// Event emis par POST /api/audits/[id]/manual-queries apres l'insertion
// des queries source='user'. La fonction Inngest associee fait visibility
// tracking + analyses pour ces query_ids uniquement, SANS re-calcul du
// score officiel (cf. brief manual queries / anti-biais).
export interface ManualQueriesAddedEvent {
  name: "audit/manual-queries-added";
  data: {
    audit_id: string;
    query_ids: string[];
  };
}

export const inngest = new Inngest({
  id: "ankora",
});

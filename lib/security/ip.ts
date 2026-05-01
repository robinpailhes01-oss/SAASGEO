// =====================================================================
// Extraction de l'IP client cote serveur
//
// Next.js / Vercel exposent l'IP via plusieurs mecanismes selon le
// runtime (edge / node) et l'infra (Vercel ajoute `x-real-ip` et
// `x-forwarded-for`). On retourne la premiere IP exploitable trouvee,
// sinon une chaine de repli ("0.0.0.0") qui ne matchera aucune IP
// reelle — utile pour les tests ou le dev local.
//
// Important : `x-forwarded-for` peut contenir une liste "client, proxy1,
// proxy2..." — on garde toujours le premier element (l'IP cliente
// d'origine), apres trim.
// =====================================================================

import type { NextRequest } from "next/server";

// Headers consideres comme fiables (par ordre de priorite)
const IP_HEADERS = ["x-real-ip", "cf-connecting-ip", "x-forwarded-for"] as const;

// Adresse de repli quand aucune IP fiable n'est trouvee
export const UNKNOWN_IP = "0.0.0.0";

// Extrait l'IP client d'une requete Next.js (compatible Edge + Node)
export function getClientIp(req: NextRequest | Request): string {
  const headers = "headers" in req ? req.headers : new Headers();

  for (const name of IP_HEADERS) {
    const raw = headers.get(name);
    if (!raw) continue;
    // x-forwarded-for peut etre une liste : on prend le premier element
    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }

  // Fallback NextRequest (deprecated mais peut exister selon runtime)
  const maybeIp = (req as { ip?: string }).ip;
  if (maybeIp) return maybeIp;

  return UNKNOWN_IP;
}

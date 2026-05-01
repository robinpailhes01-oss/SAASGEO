// =====================================================================
// Middleware Next.js — protection de la zone /admin
//
// Strategie :
// - Toute route sous /admin requiert un cookie de session HMAC valide.
// - Exceptions : /admin/login (page de saisie) et /admin/logout (purge
//   du cookie) sont accessibles sans session.
// - Si la session est absente ou invalide, redirection vers /admin/login
//   en preservant le `next` pour rebondir apres connexion.
//
// Le middleware tourne sur l'edge runtime : on utilise Web Crypto via
// les helpers de lib/auth/admin (compat edge garantie).
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifySession } from "./lib/auth/admin";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Pages publiques de la zone admin
  if (pathname === "/admin/login" || pathname === "/admin/logout") {
    return NextResponse.next();
  }

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    // Configuration manquante cote serveur : on bloque proprement
    return new NextResponse(
      "Configuration admin manquante (ADMIN_SESSION_SECRET).",
      { status: 500 }
    );
  }

  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const session = cookie ? await verifySession(cookie, secret) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("next", pathname + (search ?? ""));
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Le matcher limite le middleware aux URLs /admin/* uniquement
// (perf : pas d'execution sur le reste du site).
export const config = {
  matcher: ["/admin/:path*"],
};

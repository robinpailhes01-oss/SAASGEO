// =====================================================================
// Route /admin/logout
//
// Supprime le cookie de session admin et redirige vers /admin/login.
// Accepte GET (pratique pour un simple lien) et POST (recommande pour
// les formulaires d'action).
// =====================================================================

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/auth/admin";

function clearAndRedirect(reqUrl: string) {
  cookies().set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  const url = new URL("/admin/login", reqUrl);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  return clearAndRedirect(req.url);
}

export async function POST(req: Request) {
  return clearAndRedirect(req.url);
}

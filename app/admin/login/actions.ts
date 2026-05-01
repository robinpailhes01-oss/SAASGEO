"use server";

// Server Action de connexion admin :
// - verifie le mot de passe en constant-time vs ADMIN_PASSWORD
// - genere un cookie HMAC signe et le pose en httpOnly + Secure
// - redirige vers le `next` demande (toujours dans /admin pour eviter
//   l'open-redirect)
//
// L'erreur d'auth est remontee via le query-param `?error=1` plutot que
// par exception, pour rester sobre cote UX (rerendu controle de la page).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE_NAME,
  COOKIE_TTL_MS,
  signSession,
  verifyAdminPassword,
} from "@/lib/auth/admin";

export async function loginAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "/admin");

  // Anti open-redirect : on n'autorise que les chemins internes /admin/*
  const next =
    nextRaw.startsWith("/admin") && !nextRaw.startsWith("//")
      ? nextRaw
      : "/admin";

  if (!verifyAdminPassword(password)) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET manquant côté serveur.");
  }

  const token = await signSession(secret, COOKIE_TTL_MS);

  cookies().set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(COOKIE_TTL_MS / 1000),
  });

  redirect(next);
}

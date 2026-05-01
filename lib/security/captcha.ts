// =====================================================================
// Verification hCaptcha cote serveur — "pret a activer"
//
// Strategie : si HCAPTCHA_SECRET_KEY est absente (cas Phase A.3 a D),
// on retourne `{ enabled: false, ok: true }` pour que les routes qui
// l'appellent fonctionnent normalement en local et en preview avant
// que les vraies cles soient livrees fin Phase E.
//
// Cote client, on lit `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` :
//   - vide  : aucun widget rendu (formulaire normal)
//   - rempli : widget invisible monte par le composant <Captcha />
//
// Endpoint hCaptcha : https://hcaptcha.com/siteverify (POST, body urlencode)
// Reponse : { success: bool, "error-codes"?: string[], hostname?, score? }
// =====================================================================

const HCAPTCHA_VERIFY_URL = "https://hcaptcha.com/siteverify";

export type CaptchaResult =
  // Mode desactive (cles absentes) : on laisse passer, l'UI ne montre pas le widget
  | { ok: true; enabled: false }
  // Mode actif, jeton valide
  | { ok: true; enabled: true }
  // Mode actif, jeton invalide / absent
  | { ok: false; enabled: true; reason: "missing_token" | "invalid_token" | "network_error"; codes?: string[] };

// Le captcha est-il configure cote serveur ?
export function isCaptchaEnabled(): boolean {
  return Boolean(process.env.HCAPTCHA_SECRET_KEY);
}

// Site key publique — exposable au client. Le composant front l'utilise
// pour decider de monter le widget ou non.
export function getCaptchaSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim() || null;
}

type SiteVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
  hostname?: string;
  challenge_ts?: string;
};

// Verifie un token hCaptcha. Si le mode est desactive (pas de cle
// secrete configuree), retourne ok:true sans appel reseau.
//
// Robustesse : tout echec reseau / format remonte en `network_error`.
// L'appelant decide quoi faire (refus ou bypass) — par defaut on
// recommande un refus (fail-closed) en production.
export async function verifyCaptcha(token: string | undefined | null, ip?: string): Promise<CaptchaResult> {
  const secret = process.env.HCAPTCHA_SECRET_KEY;

  // Mode desactive : aucun controle (Phase A a D)
  if (!secret) {
    return { ok: true, enabled: false };
  }

  // Mode actif : token requis
  if (!token || typeof token !== "string") {
    return {
      ok: false,
      enabled: true,
      reason: "missing_token",
    };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  let json: SiteVerifyResponse;
  try {
    const res = await fetch(HCAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      // Timeout court : si hCaptcha rame, on echoue plutot que bloquer la UX
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, enabled: true, reason: "network_error" };
    }
    json = (await res.json()) as SiteVerifyResponse;
  } catch {
    return { ok: false, enabled: true, reason: "network_error" };
  }

  if (json.success === true) {
    return { ok: true, enabled: true };
  }

  return {
    ok: false,
    enabled: true,
    reason: "invalid_token",
    codes: json["error-codes"],
  };
}

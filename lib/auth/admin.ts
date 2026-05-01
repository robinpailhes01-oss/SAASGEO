// =====================================================================
// Auth admin V0 — session HMAC stateless
//
// Modele single-user : un seul mot de passe partage (ADMIN_PASSWORD)
// + une cle HMAC (ADMIN_SESSION_SECRET) qui signe un cookie d'expiration.
//
// Le cookie a le format `<payloadB64>.<hmacB64>` ou payload est un JSON
// minimal { iat, exp } encode en base64url. Aucun stockage serveur :
// la verification se fait uniquement via la signature HMAC SHA-256.
//
// Implementation 100% Web Crypto (subtle) pour rester compatible avec
// l'edge runtime du middleware Next.js (pas d'import node:crypto).
// =====================================================================

// Nom du cookie de session admin (httpOnly, signe HMAC)
export const ADMIN_COOKIE_NAME = "ankora_admin";

// Duree de vie du cookie : 7 jours (en millisecondes)
export const COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Charge utile du cookie : timestamps unix en millisecondes
export type SessionPayload = {
  iat: number;
  exp: number;
};

// ---------------------------------------------------------------------
// Encodage base64url (compat edge — pas de Buffer)
// ---------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  let str = s.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------
// HMAC SHA-256 via Web Crypto
// ---------------------------------------------------------------------

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(sig);
}

// Comparaison constante en temps (anti timing-attack) sur deux Uint8Array
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------
// Sign / verify session
// ---------------------------------------------------------------------

// Genere un cookie signe avec la duree de vie indiquee
export async function signSession(
  secret: string,
  ttlMs: number = COOKIE_TTL_MS
): Promise<string> {
  const now = Date.now();
  const payload: SessionPayload = { iat: now, exp: now + ttlMs };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSha256(secret, payloadB64);
  return `${payloadB64}.${toBase64Url(sig)}`;
}

// Verifie un cookie : retourne le payload si signature et expiration OK,
// sinon null. Aucune exception remontee pour faciliter l'usage en middleware.
export async function verifySession(
  cookieValue: string,
  secret: string
): Promise<SessionPayload | null> {
  if (!cookieValue || typeof cookieValue !== "string") return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  let givenSig: Uint8Array;
  try {
    givenSig = fromBase64Url(sigB64);
  } catch {
    return null;
  }

  const expectedSig = await hmacSha256(secret, payloadB64);
  if (!timingSafeEqualBytes(expectedSig, givenSig)) return null;

  try {
    const json = new TextDecoder().decode(fromBase64Url(payloadB64));
    const payload = JSON.parse(json) as SessionPayload;
    if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Verification du mot de passe admin (constant-time)
// ---------------------------------------------------------------------

// Compare le mot de passe fourni avec ADMIN_PASSWORD en constant-time.
// Retourne false si la variable d'env est absente (security by default).
export function verifyAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof input !== "string") return false;
  const enc = new TextEncoder();
  const a = enc.encode(input);
  const b = enc.encode(expected);
  return timingSafeEqualBytes(a, b);
}

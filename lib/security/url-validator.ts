// =====================================================================
// Validation stricte d'URL soumise par utilisateur (anti-SSRF + sanity)
//
// Cible : URLs de site web public a auditer. On veut empecher :
//   - Les protocoles non-web (file://, javascript:, data:, gopher:, ftp:)
//   - Les hosts internes (localhost, 127.x, ::1)
//   - Les IP privees RFC1918, link-local, loopback (anti-SSRF)
//   - Les ports non standards qui ne servent pas un site (SSH, SMB...)
//   - Les URLs vides, mal formees, sans TLD
//
// HTTPS est preferre. HTTP est accepte mais on remonte un warning
// interne via le champ `warnings` pour que l'UI ou les logs puissent
// s'en servir.
//
// Sortie : ValidationResult discrime — `ok: true` retourne une URL
// normalisee (lowercase host, sans fragment, avec slash final si racine).
// =====================================================================

export type ValidationOk = {
  ok: true;
  url: string;
  hostname: string;
  protocol: "http:" | "https:";
  warnings: ValidationWarning[];
};

export type ValidationFail = {
  ok: false;
  reason: ValidationReason;
  message: string;
};

export type ValidationResult = ValidationOk | ValidationFail;

export type ValidationReason =
  | "empty"
  | "malformed"
  | "invalid_protocol"
  | "private_host"
  | "invalid_port"
  | "invalid_tld";

export type ValidationWarning = "http_not_https";

// Protocoles autorises (web public uniquement)
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// Ports autorises (defauts web). 0 et undefined = port par defaut du protocole.
const ALLOWED_PORTS = new Set<number>([80, 443]);

// Hostnames internes textuels a bannir
const FORBIDDEN_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

// Suffixes internes / non publics
const FORBIDDEN_SUFFIXES = [".local", ".internal", ".localhost", ".test", ".invalid", ".example"];

// Test : l'hote est-il une adresse IPv4 ?
function isIPv4(host: string): boolean {
  return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(host);
}

// Test : l'hote est-il une adresse IPv6 (encadre [..] retire en amont) ?
function isIPv6(host: string): boolean {
  // Test minimal : presence de ":" et caracteres hex/":" uniquement
  return host.includes(":") && /^[0-9a-fA-F:]+$/.test(host);
}

// Une IPv4 est-elle privee / loopback / link-local / reservee ?
function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    // Format incorrect : on traite comme suspect
    return true;
  }
  const [a, b] = parts;
  // 0.0.0.0/8 — "this network"
  if (a === 0) return true;
  // 10.0.0.0/8 — RFC1918
  if (a === 10) return true;
  // 127.0.0.0/8 — loopback
  if (a === 127) return true;
  // 169.254.0.0/16 — link-local
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 — RFC1918 (172.16 a 172.31)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 — RFC1918
  if (a === 192 && b === 168) return true;
  // 224.0.0.0/4 — multicast
  if (a >= 224) return true;
  return false;
}

// Une IPv6 est-elle loopback / link-local / unique-local ?
function isPrivateIPv6(host: string): boolean {
  const lower = host.toLowerCase();
  // Loopback ::1
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  // Unspecified ::
  if (lower === "::" || /^0:0:0:0:0:0:0:0$/.test(lower)) return true;
  // Unique local fc00::/7 (fc.. ou fd..)
  if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true;
  // Link-local fe80::/10
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  return false;
}

// Validateur principal. Accepte une chaine brute ; renvoie un
// ValidationResult sans jamais lever d'exception.
export function validateAuditUrl(input: unknown): ValidationResult {
  if (typeof input !== "string") {
    return { ok: false, reason: "empty", message: "URL absente." };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty", message: "URL absente." };
  }

  // Detection de schema explicite (ex: "javascript:", "ftp://", "https://").
  // Schemes "vrais" : alphanumerique + `+`/`-`, pas de point (les points
  // signalent plutot un domaine sans schema, ex: "exemple.fr:443").
  // Si schema present : on parse tel quel, le check protocol filtrera.
  // Si absent : on prefixe https:// pour un usage humain ("ankora.ai").
  const candidate = /^[a-z][a-z0-9+\-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      ok: false,
      reason: "malformed",
      message: "URL invalide. Verifie l'orthographe.",
    };
  }

  // Protocole — on ne tolere QUE http/https (pas de file:, javascript:, data:, ftp:, gopher:)
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      reason: "invalid_protocol",
      message: "Seules les URLs http(s) sont acceptees.",
    };
  }

  // Hostname (nu, sans crochets IPv6)
  let hostname = parsed.hostname.toLowerCase();
  // URL conserve les crochets pour IPv6 dans `host` mais pas dans `hostname` :
  // on normalise quand meme par precaution.
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }

  if (!hostname) {
    return {
      ok: false,
      reason: "malformed",
      message: "Nom de domaine manquant.",
    };
  }

  // Hostnames internes
  if (FORBIDDEN_HOSTNAMES.has(hostname)) {
    return {
      ok: false,
      reason: "private_host",
      message: "Les hotes internes ne sont pas autorises.",
    };
  }
  for (const suffix of FORBIDDEN_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return {
        ok: false,
        reason: "private_host",
        message: "Les domaines internes ou de test ne sont pas autorises.",
      };
    }
  }

  // IPs : interdire les plages privees / loopback / link-local
  if (isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) {
      return {
        ok: false,
        reason: "private_host",
        message: "Les adresses IP privees ou loopback ne sont pas autorisees.",
      };
    }
  } else if (isIPv6(hostname)) {
    if (isPrivateIPv6(hostname)) {
      return {
        ok: false,
        reason: "private_host",
        message: "Les adresses IPv6 privees ne sont pas autorisees.",
      };
    }
  } else {
    // Hostname textuel : il doit contenir au moins un point ET un TLD non vide
    const lastDot = hostname.lastIndexOf(".");
    if (lastDot < 0 || lastDot === hostname.length - 1) {
      return {
        ok: false,
        reason: "invalid_tld",
        message: "Domaine sans extension (ex: .com, .fr).",
      };
    }
    const tld = hostname.slice(lastDot + 1);
    // TLD doit etre alphabetique d'au moins 2 caracteres (xn-- pour IDN inclus)
    if (!/^[a-z]{2,}$/.test(tld) && !tld.startsWith("xn--")) {
      return {
        ok: false,
        reason: "invalid_tld",
        message: "Extension de domaine invalide.",
      };
    }
  }

  // Port : autorise vide (defaut), 80 ou 443
  if (parsed.port) {
    const portNum = parseInt(parsed.port, 10);
    if (!ALLOWED_PORTS.has(portNum)) {
      return {
        ok: false,
        reason: "invalid_port",
        message: "Seuls les ports 80 et 443 sont acceptes.",
      };
    }
  }

  // Normalisation de sortie :
  // - hostname en lowercase
  // - fragment retire
  // - slash final si pathname vide
  parsed.hostname = hostname;
  parsed.hash = "";
  if (!parsed.pathname || parsed.pathname === "") {
    parsed.pathname = "/";
  }

  const warnings: ValidationWarning[] = [];
  if (parsed.protocol === "http:") {
    warnings.push("http_not_https");
  }

  return {
    ok: true,
    url: parsed.toString(),
    hostname,
    protocol: parsed.protocol as "http:" | "https:",
    warnings,
  };
}

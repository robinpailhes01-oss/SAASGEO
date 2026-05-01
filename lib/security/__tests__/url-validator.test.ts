import { describe, it, expect } from "vitest";
import { validateAuditUrl } from "../url-validator";

// Suite couvrant les principales surfaces d'attaque attendues sur la
// landing publique : protocoles exotiques, IPs privees, hosts internes,
// domaines mal formes, ports non standards. Egalement les cas heureux
// (URL bien formee https + http avec warning).

describe("url-validator — entrees vides / mal formees", () => {
  it("rejette une chaine vide", () => {
    const r = validateAuditUrl("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  it("rejette null / undefined / nombre", () => {
    expect(validateAuditUrl(null).ok).toBe(false);
    expect(validateAuditUrl(undefined).ok).toBe(false);
    expect(validateAuditUrl(42 as unknown).ok).toBe(false);
  });

  it("rejette une chaine non parsable", () => {
    const r = validateAuditUrl("ht!tp://%%%%");
    expect(r.ok).toBe(false);
  });
});

describe("url-validator — protocoles", () => {
  it("rejette file://", () => {
    const r = validateAuditUrl("file:///etc/passwd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_protocol");
  });

  it("rejette javascript:", () => {
    const r = validateAuditUrl("javascript:alert(1)");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_protocol");
  });

  it("rejette data:", () => {
    const r = validateAuditUrl("data:text/html,<script>alert(1)</script>");
    expect(r.ok).toBe(false);
  });

  it("rejette ftp://", () => {
    const r = validateAuditUrl("ftp://example.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_protocol");
  });
});

describe("url-validator — hosts internes / IPs privees", () => {
  it("rejette localhost", () => {
    const r = validateAuditUrl("http://localhost:3000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("private_host");
  });

  it("rejette 127.0.0.1", () => {
    const r = validateAuditUrl("http://127.0.0.1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("private_host");
  });

  it("rejette 10.0.0.1 (RFC1918)", () => {
    expect(validateAuditUrl("http://10.0.0.1").ok).toBe(false);
  });

  it("rejette 192.168.1.1 (RFC1918)", () => {
    expect(validateAuditUrl("http://192.168.1.1").ok).toBe(false);
  });

  it("rejette 172.16.0.1 et 172.31.255.255 (RFC1918)", () => {
    expect(validateAuditUrl("http://172.16.0.1").ok).toBe(false);
    expect(validateAuditUrl("http://172.31.255.255").ok).toBe(false);
  });

  it("accepte 172.32.0.1 (hors RFC1918)", () => {
    expect(validateAuditUrl("http://172.32.0.1").ok).toBe(true);
  });

  it("rejette 169.254.169.254 (link-local AWS metadata)", () => {
    expect(validateAuditUrl("http://169.254.169.254").ok).toBe(false);
  });

  it("rejette 0.0.0.0", () => {
    expect(validateAuditUrl("http://0.0.0.0").ok).toBe(false);
  });

  it("rejette ::1 (IPv6 loopback)", () => {
    expect(validateAuditUrl("http://[::1]").ok).toBe(false);
  });

  it("rejette les domaines .local et .internal", () => {
    expect(validateAuditUrl("http://serveur.local").ok).toBe(false);
    expect(validateAuditUrl("http://api.internal").ok).toBe(false);
  });
});

describe("url-validator — TLD", () => {
  it("rejette un host sans point", () => {
    expect(validateAuditUrl("http://monsite").ok).toBe(false);
  });

  it("rejette un host se terminant par un point", () => {
    expect(validateAuditUrl("http://monsite.").ok).toBe(false);
  });

  it("rejette un TLD numerique", () => {
    // Le parser WHATWG URL traite ".123" comme une tentative IPv4 et leve
    // une exception => categorisation "malformed". Notre validateur a son
    // propre check "invalid_tld" pour les autres formes (ex: TLD a 1 char).
    // Ici on verifie juste que le rejet a bien lieu.
    const r = validateAuditUrl("http://exemple.123");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(["malformed", "invalid_tld"]).toContain(r.reason);
    }
  });

  it("rejette un TLD a un seul caractere", () => {
    const r = validateAuditUrl("http://exemple.x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_tld");
  });
});

describe("url-validator — ports", () => {
  it("accepte port absent (defaut)", () => {
    expect(validateAuditUrl("https://exemple.fr").ok).toBe(true);
  });

  it("accepte port 443 explicite", () => {
    expect(validateAuditUrl("https://exemple.fr:443").ok).toBe(true);
  });

  it("rejette port 22 (SSH)", () => {
    const r = validateAuditUrl("http://exemple.fr:22");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_port");
  });

  it("rejette port 3000", () => {
    expect(validateAuditUrl("http://exemple.fr:3000").ok).toBe(false);
  });
});

describe("url-validator — cas heureux et normalisation", () => {
  it("accepte une URL https propre", () => {
    const r = validateAuditUrl("https://exemple.fr");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.protocol).toBe("https:");
      expect(r.hostname).toBe("exemple.fr");
      expect(r.warnings).toEqual([]);
    }
  });

  it("ajoute https:// si l'utilisateur omet le schema", () => {
    const r = validateAuditUrl("ankora.ai");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.protocol).toBe("https:");
      expect(r.url.startsWith("https://ankora.ai")).toBe(true);
    }
  });

  it("normalise le hostname en lowercase", () => {
    const r = validateAuditUrl("https://EXEMPLE.FR/path");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hostname).toBe("exemple.fr");
    }
  });

  it("retire le fragment", () => {
    const r = validateAuditUrl("https://exemple.fr/page#hash");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.includes("#")).toBe(false);
    }
  });

  it("ajoute un slash final si pathname vide", () => {
    const r = validateAuditUrl("https://exemple.fr");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toBe("https://exemple.fr/");
    }
  });

  it("emet un warning http_not_https sur HTTP", () => {
    const r = validateAuditUrl("http://exemple.fr");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toContain("http_not_https");
    }
  });

  it("accepte un sous-domaine et un chemin profond", () => {
    const r = validateAuditUrl("https://www.harmonie-yacht.com/luxury/charter");
    expect(r.ok).toBe(true);
  });

  it("accepte un domaine IDN (xn--)", () => {
    const r = validateAuditUrl("https://exemple.xn--p1ai");
    expect(r.ok).toBe(true);
  });
});

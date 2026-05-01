import Link from "next/link";

import { Logo } from "./Logo";
import { Container } from "./Container";

// =====================================================================
// <Footer /> — pied de page public minimal.
//
// 3 colonnes mobile-stacked :
//   - Branding (logo + baseline)
//   - Pages legales (placeholder en V0 — pages reelles en Phase E)
//   - Contact (email + Calendly indirect via la page rapport)
//
// Les liens legaux pointent sur des pages stub aujourd'hui, qui seront
// remplies en Phase E avant le go live.
// =====================================================================

const legalLinks: { href: string; label: string }[] = [
  { href: "/legal/mentions", label: "Mentions légales" },
  { href: "/legal/confidentialite", label: "Confidentialité" },
  { href: "/legal/cgu", label: "Conditions d'utilisation" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-ankora-border bg-background">
      <Container>
        <div className="grid gap-10 py-12 md:grid-cols-3">
          {/* Branding */}
          <div className="space-y-3">
            <Logo />
            <p className="text-sm text-ankora-text-soft max-w-xs">
              Ancrez votre marque dans les IA conversationnelles.
              Audit GEO et tracking de visibilité, spécialisé tourisme et hôtellerie.
            </p>
          </div>

          {/* Legal */}
          <div>
            <p className="font-display text-sm font-semibold text-ankora-text mb-3">
              Mentions
            </p>
            <ul className="space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-ankora-text-soft transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="font-display text-sm font-semibold text-ankora-text mb-3">
              Contact
            </p>
            <ul className="space-y-2">
              <li>
                <a
                  href="mailto:robin@ankora.ai"
                  className="text-sm text-ankora-text-soft transition-colors hover:text-primary"
                >
                  robin@ankora.ai
                </a>
              </li>
              <li className="text-sm text-ankora-text-soft">
                Hébergement EU — Frankfurt
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-ankora-border py-6 text-center text-xs text-ankora-text-muted">
          &copy; {year} Ankora. Tous droits réservés.
        </div>
      </Container>
    </footer>
  );
}

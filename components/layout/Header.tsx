import Link from "next/link";

import { Logo } from "./Logo";
import { Container } from "./Container";
import { Button } from "@/components/ui/button";

// =====================================================================
// <Header /> — barre de navigation publique (landing + rapport).
//
// Tres epure : juste le logo a gauche et un CTA "Auditer mon site"
// a droite (visible sur la page rapport). Pas de mega-menu, pas de
// drawer mobile. Mobile-first : sur petits ecrans on cache simplement
// le CTA secondaire (les ecrans rapport ont leur propre CTA Calendly
// dans le contenu).
//
// La prop `variant` permet de masquer le CTA sur la landing elle-meme
// (eviter le bouton redondant avec le hero).
//
// Note iOS Safari (theme-color + fade) : le viewport.themeColor de
// app/layout.tsx aligne la status bar Safari sur le fond #FAFAFE.
// En complement, un fin overlay gradient en sommet de header lisse
// la jonction visuelle entre la barre Safari et la page (utile sur
// iPad ou la barre d'URL est translucide).
// =====================================================================

type HeaderProps = {
  variant?: "default" | "minimal";
};

export function Header({ variant = "default" }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-ankora-border bg-background/85 backdrop-blur-md">
      {/* Fade-out overlay tout en haut : adoucit la jonction avec la
          status bar Safari iOS et masque tout glow residuel. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-background via-background/85 to-transparent"
      />
      <Container>
        <div className="relative flex h-16 items-center justify-between">
          <Logo />

          {variant === "default" && (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="#comment">Comment ça marche</Link>
              </Button>
              <Button asChild variant="gradient" size="sm">
                <Link href="/#audit">Auditer mon site</Link>
              </Button>
            </div>
          )}
        </div>
      </Container>
    </header>
  );
}

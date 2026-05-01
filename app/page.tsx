// =====================================================================
// Landing temporaire — Bloc 5 Phase A.5
//
// La vraie landing (hero immersif + 4 logos IA + sections) sera livree
// en Phase B. Ici on s'integre simplement avec le Header / Footer pour
// valider la coherence du shell public.
// =====================================================================

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      {/* Sur la landing on masque le CTA du header (redondant avec le hero) */}
      <Header variant="minimal" />

      <main>
        <Container className="py-20 sm:py-28 text-center">
          <Badge variant="outline" className="mb-6">
            Phase A.5 — Layouts en place
          </Badge>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.05]">
            <span className="text-ankora-ink">Ancrez votre marque</span>
            <br />
            <span className="text-ankora-gradient">dans les IA</span>
          </h1>

          <p className="mt-8 text-lg sm:text-xl text-ankora-text-soft max-w-2xl mx-auto">
            Audit GEO complet et tracking de visibilite dans les IA
            conversationnelles. Specialise tourisme et hotellerie.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4">
            <Button asChild variant="gradient" size="xl">
              <Link href="#audit">Lancer mon audit gratuit</Link>
            </Button>
            <p className="text-sm text-ankora-text-muted">
              Hero immersif et formulaire reels arrivent en Phase B.
            </p>
          </div>
        </Container>
      </main>

      <Footer />
    </>
  );
}

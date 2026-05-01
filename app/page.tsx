// =====================================================================
// Landing Ankora — Bloc 5 (Phase B + Landing v2)
//
// Composition v2 :
//   1. Header (variant minimal, pour ne pas surcharger le hero)
//   2. Hero : titre choc + sous-titre + formulaire + AILogos +
//      HeroMockup (apercu rapport en perspective avec cards flottantes)
//   3. MetricsBar : 4 KPI cards reels (4 IA, 30 questions, 51 criteres,
//      ~5 minutes) — ancre le serieux des le "above the fold scroll"
//   4. HowItWorks : 3 etapes
//   5. WhyAnkora : 3 differenciateurs (tourisme, francais, plan d'action)
//   6. WhyUrgent v2 : layout 2 cols texte+stats / AISearchMockup
//   7. FinalCta : encadre gradient avec form integre
//   8. Footer
//
// SEO : meta title + description, OpenGraph, Twitter Card, JSON-LD
// WebApplication. Fonts deja optimises au layout root (Geist + Inter +
// JetBrains via next/font, swap+preload).
// =====================================================================

import type { Metadata } from "next";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/layout/Container";
import { HeroAuditForm } from "@/components/landing/HeroAuditForm";
import { HeroMockup } from "@/components/landing/HeroMockup";
import { AILogos } from "@/components/landing/AILogos";
import { MetricsBar } from "@/components/landing/MetricsBar";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhyAnkora } from "@/components/landing/WhyAnkora";
import { WhyUrgent } from "@/components/landing/WhyUrgent";
import { FinalCta } from "@/components/landing/FinalCta";

const SITE_TITLE =
  "Ankora — Audit gratuit de votre visibilité sur ChatGPT, Claude, Perplexity, Gemini";
const SITE_DESCRIPTION =
  "Découvrez en 5 minutes si votre marque est citée par les IA conversationnelles. Audit gratuit, sans inscription.";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "/",
    siteName: "Ankora",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Ankora — Audit GEO et tracking IA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

// JSON-LD WebApplication — facilite la decouverte par les IA et Google
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Ankora",
  description: SITE_DESCRIPTION,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
  },
  inLanguage: "fr-FR",
};

export default function HomePage() {
  return (
    <>
      <Header variant="minimal" />

      <main>
        {/* ---------- HERO ---------- */}
        <section
          id="audit"
          className="relative overflow-hidden pt-16 pb-12 sm:pt-24 sm:pb-16"
          aria-labelledby="hero-title"
        >
          {/* Fond radial lavande tres leger (style NuroAI) — purement decoratif */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(167, 139, 250, 0.18), transparent 70%), radial-gradient(ellipse 60% 40% at 50% 30%, rgba(240, 171, 252, 0.10), transparent 60%)",
            }}
          />

          <Container>
            <div className="mx-auto max-w-4xl text-center">
              <h1
                id="hero-title"
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight"
              >
                <span className="text-ankora-ink">Combien de fois </span>
                <span className="text-ankora-gradient">ChatGPT</span>
                <span className="text-ankora-ink">
                  {" "}
                  recommande votre marque à vos clients ?
                </span>
              </h1>

              <p className="mt-6 sm:mt-8 mx-auto max-w-2xl text-base sm:text-lg md:text-xl text-ankora-text-soft leading-relaxed">
                Découvrez en 5 minutes votre score de visibilité sur ChatGPT, Claude, Perplexity et Gemini. Gratuit, sans inscription.
              </p>

              <div className="mt-10 sm:mt-12">
                <HeroAuditForm />
              </div>

              <AILogos className="mt-12 sm:mt-14" />
            </div>

            {/* Mockup apercu rapport (apres logos IA, avant scroll) */}
            <HeroMockup className="mt-10 sm:mt-14" />
          </Container>
        </section>

        {/* ---------- KPI CARDS REELS ---------- */}
        <MetricsBar />

        {/* ---------- COMMENT CA MARCHE ---------- */}
        <HowItWorks />

        {/* ---------- POURQUOI ANKORA ---------- */}
        <WhyAnkora />

        {/* ---------- POURQUOI C'EST URGENT (avec mockup chat IA) ---------- */}
        <WhyUrgent />

        {/* ---------- CTA FINAL ---------- */}
        <FinalCta />
      </main>

      <Footer />

      {/* JSON-LD : injecte hors arbre React pour ne pas alourdir l'hydratation */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}

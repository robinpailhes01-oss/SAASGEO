// =====================================================================
// Landing Ankora — Bloc 5 (Phase B + Landing v2 + GEO Self-Application)
//
// Composition :
//   1. Header (variant minimal, pour ne pas surcharger le hero)
//   2. Hero : titre choc + sous-titre + formulaire + AILogos +
//      HeroMockup (apercu rapport en perspective avec cards flottantes)
//   3. MetricsBar : 4 KPI cards reels (4 IA, 30 questions, 51 criteres,
//      ~5 minutes) — ancre le serieux des le "above the fold scroll"
//   4. MarketStats : 4 stats sourcees du marche IA conversationnel
//      (800M MAU ChatGPT, 1.2% commerces locaux cites, 4.4x conversion,
//      +527% trafic). CHAQUE stat avec sa source visible — credibilite.
//   5. HowItWorks : 3 etapes
//   6. WhyAnkora : 3 differenciateurs (multi-secteurs, francais, plan d'action)
//   7. WhyUrgent v2 : layout 2 cols texte+stats / AISearchMockup
//   8. FAQ : 6 questions/reponses BLUF + schema FAQPage (cf. JSON-LD)
//   9. FinalCta : encadre gradient avec form integre
//   10. Footer
//
// SEO + GEO (Generative Engine Optimization, le produit qui vend la
// visibilite IA doit lui-meme etre visible) :
//   - meta title/description, OpenGraph, Twitter Card
//   - JSON-LD SoftwareApplication enrichi (creator Organization, offers)
//   - JSON-LD FAQPage genere depuis FAQ_ITEMS (single source of truth)
//   - app/robots.ts autorise explicitement GPTBot, OAI-SearchBot,
//     ClaudeBot, PerplexityBot, Google-Extended (+ wildcard)
//   - public/llms.txt decrit l'offre Ankora pour les IA
//
// Fonts deja optimises au layout root (Geist + Inter + JetBrains via
// next/font, swap+preload).
// =====================================================================

import type { Metadata } from "next";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/layout/Container";
import { HeroAuditForm } from "@/components/landing/HeroAuditForm";
import { HeroMockup } from "@/components/landing/HeroMockup";
import { AILogos } from "@/components/landing/AILogos";
import { MetricsBar } from "@/components/landing/MetricsBar";
import { MarketStats } from "@/components/landing/MarketStats";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhyAnkora } from "@/components/landing/WhyAnkora";
import { WhyUrgent } from "@/components/landing/WhyUrgent";
import { FAQ } from "@/components/landing/FAQ";
import { FAQ_ITEMS } from "@/components/landing/faq-items";
import { FinalCta } from "@/components/landing/FinalCta";

const SITE_TITLE =
  "Ankora — Audit gratuit de votre visibilité sur ChatGPT, Claude, Perplexity, Gemini";
const SITE_DESCRIPTION =
  "Audit de visibilité IA pour commerces locaux français. Mesurez si votre entreprise apparaît dans ChatGPT, Claude, Perplexity et Gemini quand vos clients vous cherchent. Gratuit, sans inscription.";

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://saasgeo-two.vercel.app";

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

// JSON-LD SoftwareApplication enrichi : facilite la decouverte par
// Google + permet aux IA (ChatGPT, Perplexity, Gemini grounding) de
// citer Ankora avec contexte structure complet (offre, langue,
// createur Organization). Plus precis que WebApplication car expose
// applicationCategory + operatingSystem.
const jsonLdSoftwareApp = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Ankora",
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "fr-FR",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
    description: "Audit gratuit de visibilité IA, sans inscription",
  },
  creator: {
    "@type": "Organization",
    name: "Ankora",
    url: SITE_URL,
  },
};

// JSON-LD FAQPage genere depuis FAQ_ITEMS (single source of truth :
// si on edite la FAQ visible cote UI, le schema reste sync).
const jsonLdFaq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
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
              {/* Eyebrow tagline : positionne le service en moins d'1 seconde
                  (style premium SaaS — font-mono Ankora + uppercase) */}
              <p className="font-mono text-[10px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-ankora-text-muted">
                Audit GEO <span aria-hidden="true">·</span> ChatGPT{" "}
                <span aria-hidden="true">·</span> Claude{" "}
                <span aria-hidden="true">·</span> Perplexity{" "}
                <span aria-hidden="true">·</span> Gemini
              </p>

              <h1
                id="hero-title"
                className="mt-4 sm:mt-5 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight"
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

        {/* ---------- STATS DU MARCHE IA (sources publiques) ---------- */}
        <MarketStats />

        {/* ---------- COMMENT CA MARCHE ---------- */}
        <HowItWorks />

        {/* ---------- POURQUOI ANKORA ---------- */}
        <WhyAnkora />

        {/* ---------- POURQUOI C'EST URGENT (avec mockup chat IA) ---------- */}
        <WhyUrgent />

        {/* ---------- FAQ (BLUF, 6 questions + schema FAQPage) ---------- */}
        <FAQ />

        {/* ---------- CTA FINAL ---------- */}
        <FinalCta />
      </main>

      <Footer />

      {/* JSON-LD SoftwareApplication : decouverte structuree par Google
          + grounding IA (ChatGPT search, Perplexity). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLdSoftwareApp),
        }}
      />
      {/* JSON-LD FAQPage : permet aux IA d'extraire les paires Q/R
          directement et de les citer dans les reponses. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFaq) }}
      />
    </>
  );
}

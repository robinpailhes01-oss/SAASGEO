// =====================================================================
// /robots.txt — politique de crawl pour les bots IA + indexation Google.
//
// Strategie : on AUTORISE explicitement tous les bots IA conversation-
// nelles connus (ChatGPT, Claude, Perplexity, Gemini) ET les bots SEO
// classiques (Googlebot, Bingbot). C'est une politique pro-visibilite
// alignee avec la mission Ankora — montrer qu'on pratique ce qu'on
// preche.
//
// Le sitemap pointe sur la racine du site (sera enrichi quand on aura
// du contenu blog en Bloc 6).
// =====================================================================

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // Pages a exclure systematiquement : panneau admin (auth requise) et
  // routes transitoires d'audit (UUID v4 unguessable, pas censees etre
  // indexees ni passees aux IA pour eviter de polluer leurs reponses
  // avec des rapports prives).
  const disallowAll = ["/admin", "/admin/", "/audit/"];

  // Bots IA conversationnelles a autoriser explicitement. Liste tenue
  // a jour en juin 2026 — chaque entreprise IA documente son user-agent
  // et la facon de l'autoriser/bloquer dans son onboarding bots.
  const aiBots = [
    "GPTBot", // OpenAI — crawler pour entrainement + grounding ChatGPT search
    "OAI-SearchBot", // OpenAI — quand ChatGPT search recupere une page en live
    "ChatGPT-User", // OpenAI — user agent de l'app ChatGPT (browsing actions)
    "ClaudeBot", // Anthropic — crawler general
    "Claude-Web", // Anthropic — Claude.ai quand l'utilisateur browse
    "anthropic-ai", // Anthropic — variante crawler
    "PerplexityBot", // Perplexity — crawler principal
    "Perplexity-User", // Perplexity — quand un user pose une question live
    "Google-Extended", // Google — opt-in pour Bard/Gemini grounding
  ];

  return {
    rules: [
      // SEO classique : autorisation totale sauf pages privees
      {
        userAgent: ["Googlebot", "Bingbot", "DuckDuckBot"],
        allow: "/",
        disallow: disallowAll,
      },
      // Bots IA : explicit Allow / Disallow nominatif. Important :
      // certains bots ne respectent que les regles avec leur user-agent
      // EXACT (pas le wildcard *), d'ou l'enumeration nominale.
      ...aiBots.map((bot) => ({
        userAgent: bot,
        allow: "/",
        disallow: disallowAll,
      })),
      // Wildcard : tout autre bot a les memes droits que les bots IA.
      // Politique pro-decouvrabilite par defaut.
      {
        userAgent: "*",
        allow: "/",
        disallow: disallowAll,
      },
    ],
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://saasgeo-two.vercel.app"}/sitemap.xml`,
  };
}

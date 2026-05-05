// =====================================================================
// faq-items — donnees pures de la FAQ landing.
//
// SEPARE de FAQ.tsx ('use client') pour pouvoir etre importe a la fois
// par le composant client (rendu UI) et par app/page.tsx (server
// component, generation du JSON-LD FAQPage). Le tableau est la source
// unique de verite : si on edite une question/reponse ici, les deux
// surfaces (UI + schema) restent synchronises.
//
// Format BLUF (Bottom Line Up Front) : reponses 40-60 mots maximum,
// directes, sans intro/conclusion. C'est ce que les IA recommandent
// pour etre cite (elles preferent les reponses concises et factuelles).
// =====================================================================

export type FAQItem = {
  question: string;
  answer: string;
};

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: "Qu'est-ce que la visibilité IA ?",
    answer:
      "La visibilité IA mesure si votre marque apparaît dans les réponses de ChatGPT, Claude, Perplexity et Gemini quand un client tape une question liée à votre activité. Différent du SEO classique : on regarde les réponses conversationnelles, pas les liens bleus Google.",
  },
  {
    question: "Pourquoi mon commerce n'apparaît pas dans ChatGPT ?",
    answer:
      "Trois causes principales : votre site n'est pas optimisé pour être lu par les robots IA (fichiers techniques absents), votre marque n'est pas citée par les sources que les IA consultent (presse locale, annuaires), et votre contenu ne répond pas aux questions exactes que posent vos clients.",
  },
  {
    question: "Combien de temps pour voir des résultats ?",
    answer:
      "Les actions techniques (autorisations IA, balisage) sont visibles en 24 à 72 heures. Les actions de contenu (pages dédiées aux questions clients) prennent 30 à 60 jours. Les actions d'autorité externe (presse, annuaires sectoriels) ont un impact durable sur 3 à 6 mois.",
  },
  {
    question: "Quelle est la différence entre Ankora et le SEO classique ?",
    answer:
      "Le SEO optimise pour les liens bleus de Google. Ankora optimise pour les réponses des IA conversationnelles (ChatGPT, Claude, Perplexity, Gemini). Les deux sont complémentaires mais distincts : les IA citent souvent des sources que Google ne classe pas en premier, et inversement.",
  },
  {
    question: "Est-ce que l'audit est vraiment gratuit ?",
    answer:
      "Oui, totalement gratuit. Pas de carte bancaire, pas d'inscription, pas de limitation. Vous obtenez le rapport complet en 5 minutes. Une consultation accompagnée payante (290 €) est proposée pour ceux qui veulent un plan d'action écrit et personnalisé.",
  },
  {
    question: "Quels commerces peuvent utiliser Ankora ?",
    answer:
      "Tout commerce français ayant une présence physique locale : restaurants, hôtels, activités touristiques, artisans, garages, salons, cabinets, boutiques. Les marques nationales sans implantation physique (e-commerce, SaaS) sont aussi prises en charge avec un mode adapté.",
  },
];

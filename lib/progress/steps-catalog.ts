// =====================================================================
// Catalogue narratif des 13 etapes de la page de progression.
//
// Le pipeline backend n'emet que ~10 jalons reels (cf. lib/ai/pipeline-
// steps.ts). Pour donner au prospect l'impression d'un travail riche
// et transparent, on derive 13 etapes narratives du brief Bloc 5 et
// on infere leur etat (done / current / pending) uniquement a partir
// du `progress` (0-100) et du `status` recu de Supabase.
//
// Les details (chiffres) sont volontairement generiques en Phase C —
// la page rapport (Phase D) affichera les vraies valeurs.
// =====================================================================

export type StepDetail = {
  kind: "success" | "warning" | "neutral";
  text: string;
};

export type ProgressStep = {
  id: string;
  // Seuil de progression a partir duquel l'etape est consideree comme
  // terminee. Ex: threshold=20 => done si audit.progress >= 20.
  threshold: number;
  emoji: string;
  title: string;
  details: StepDetail[];
};

// Les 13 etapes alignees sur le brief Bloc 5.
// Les % sont synchronises avec ceux emis par lib/ai/pipeline-steps.ts.
export const PROGRESS_STEPS: ProgressStep[] = [
  {
    id: "connect",
    threshold: 5,
    emoji: "\u{1F50D}",
    title: "Connexion à votre site",
    details: [{ kind: "success", text: "Site accessible" }],
  },
  {
    id: "structure",
    threshold: 10,
    emoji: "\u{1F4C4}",
    title: "Analyse de la structure technique",
    details: [
      { kind: "success", text: "Pages parcourues" },
      { kind: "neutral", text: "sitemap.xml, robots.txt, llms.txt vérifiés" },
    ],
  },
  {
    id: "bots",
    threshold: 15,
    emoji: "\u{1F916}",
    title: "Vérification de l'autorisation des bots IA",
    details: [
      { kind: "neutral", text: "GPTBot, ClaudeBot, PerplexityBot, Google-Extended" },
    ],
  },
  {
    id: "tech-audit",
    threshold: 20,
    emoji: "\u{1F3D7}️",
    title: "Audit technique GEO (51 critères)",
    details: [
      { kind: "success", text: "5 catégories analysées" },
      { kind: "neutral", text: "Score technique calculé" },
    ],
  },
  {
    id: "business",
    threshold: 25,
    emoji: "\u{1F9E0}",
    title: "Identification de votre activité",
    details: [
      { kind: "neutral", text: "Secteur, zone géographique, services principaux" },
    ],
  },
  {
    id: "queries",
    threshold: 35,
    emoji: "\u{270D}️",
    title: "Génération de 30 questions clients réalistes",
    details: [
      { kind: "neutral", text: "Requêtes de marque, services et comparatives" },
    ],
  },
  {
    id: "chatgpt",
    threshold: 45,
    emoji: "\u{1F4AC}",
    title: "Interrogation de ChatGPT (GPT-4o)",
    details: [{ kind: "success", text: "30 réponses récupérées" }],
  },
  {
    id: "claude",
    threshold: 55,
    emoji: "\u{1F4AC}",
    title: "Interrogation de Claude (Sonnet 4.5)",
    details: [{ kind: "success", text: "30 réponses récupérées" }],
  },
  {
    id: "perplexity",
    threshold: 65,
    emoji: "\u{1F4AC}",
    title: "Interrogation de Perplexity (Sonar)",
    details: [{ kind: "success", text: "30 réponses récupérées" }],
  },
  {
    id: "gemini",
    threshold: 75,
    emoji: "\u{1F4AC}",
    title: "Interrogation de Gemini (2.0 Flash)",
    details: [{ kind: "success", text: "30 réponses récupérées" }],
  },
  {
    id: "analysis",
    threshold: 85,
    emoji: "\u{1F52C}",
    title: "Analyse approfondie de 120 réponses IA",
    details: [
      { kind: "neutral", text: "Détection des mentions, citations, concurrents" },
    ],
  },
  {
    id: "scoring",
    threshold: 92,
    emoji: "\u{1F4CA}",
    title: "Calcul de votre score AI Visibility",
    details: [{ kind: "neutral", text: "Score par IA et score moyen" }],
  },
  {
    id: "recos",
    threshold: 97,
    emoji: "\u{1F4A1}",
    title: "Génération des recommandations personnalisées",
    details: [{ kind: "neutral", text: "Plan d'action priorisé" }],
  },
];

// Etat d'une etape pour le rendu UI
export type StepState = "done" | "current" | "pending";

// Determine l'etat de chaque etape en fonction du `progress` actuel.
// - done    : seuil atteint (progress >= threshold)
// - current : seuil pas encore atteint, mais c'est la prochaine
// - pending : etapes futures
export function computeStepStates(progress: number): StepState[] {
  let foundCurrent = false;
  return PROGRESS_STEPS.map((step) => {
    if (progress >= step.threshold) return "done";
    if (!foundCurrent) {
      foundCurrent = true;
      return "current";
    }
    return "pending";
  });
}

// Helper : combien d'etapes deja terminees ?
export function countDone(progress: number): number {
  return PROGRESS_STEPS.filter((s) => progress >= s.threshold).length;
}

// =====================================================================
// Prompt : generation des 30 requetes types pour la visibility tracking.
// Modele cible : Claude Sonnet 4.6 en mode JSON (cout ~0.01€/audit).
//
// 3 categories x 10 requetes = 30 :
//   - branded   : avec le nom de la marque ("Avis sur X", "X est-il fiable ?")
//   - service   : sans la marque, sur les services ("meilleur hotel a Y")
//   - comparative : comparaisons ("X vs Y", "alternative a X")
// =====================================================================

import { z } from "zod";
import type { BusinessInfo } from "./brand-extract";

export const GeneratedQueriesSchema = z.object({
  branded: z
    .array(z.string())
    .length(10)
    .describe("10 requetes mentionnant explicitement la marque"),
  service: z
    .array(z.string())
    .length(10)
    .describe(
      "10 requetes sur le service/secteur SANS mentionner la marque (un user qui ne connait pas encore la marque)"
    ),
  comparative: z
    .array(z.string())
    .length(10)
    .describe(
      "10 requetes comparatives (vs concurrent, alternative, top X, etc.)"
    ),
});

export type GeneratedQueries = z.infer<typeof GeneratedQueriesSchema>;

export function buildQueriesGenPrompt(business: BusinessInfo): {
  system: string;
  prompt: string;
} {
  const langInstruction =
    business.language === "fr"
      ? "Genere les requetes en francais naturel (comme un user FR poserait sur ChatGPT/Claude/Perplexity/Gemini)."
      : business.language === "en"
        ? "Generate queries in natural English."
        : `Generate queries in the user's primary language (${business.language}).`;

  const geoContext = business.geo_zone
    ? `Zone geographique : ${business.geo_zone}. Integre cette information dans certaines requetes service et comparative pour simuler la geolocalisation.`
    : "Pas de zone geographique specifique.";

  return {
    system: `Tu es un expert en comportement de recherche conversationnelle. Tu generes des requetes realistes que des prospects poseraient a ChatGPT, Claude, Perplexity ou Gemini pour decouvrir un business comme celui-ci.

REGLES STRICTES :
- Requetes naturelles, conversationnelles (pas du SEO keyword stuffing)
- Format question complete OU intent explicite (pas juste "hotel paris")
- Pas de duplication, pas de variations triviales
- Pas de mentions de la marque dans les categories "service" et "comparative"
- Reponds UNIQUEMENT avec un JSON valide qui matche le schema.`,
    prompt: `Genere 30 requetes pour tracker la visibilite IA du business suivant :

Marque : ${business.brand_name}
Variantes : ${business.brand_aliases.join(", ")}
Secteur : ${business.industry ?? "non precise"}
Services : ${business.services.join(", ")}
${geoContext}
Concurrents detectes : ${business.detected_competitors.join(", ") || "aucun detecte"}

${langInstruction}

Format de reponse JSON :

{
  "branded": [
    "10 requetes qui mentionnent ${business.brand_name} explicitement",
    "exemples : 'Avis sur ${business.brand_name}', '${business.brand_name} est-il fiable ?', 'Que vaut ${business.brand_name} ?'"
  ],
  "service": [
    "10 requetes sur le service/secteur SANS mentionner ${business.brand_name}",
    "exemples : 'Quel est le meilleur [service] a [zone] ?', 'Recommande-moi un [service] pour [besoin]'"
  ],
  "comparative": [
    "10 requetes comparatives ou alternatives",
    "exemples : '[concurrent1] vs [concurrent2]', 'alternatives a [concurrent]', 'top 5 [secteur] a [zone]'"
  ]
}

Reponds UNIQUEMENT avec le JSON, sans texte autour, sans backticks markdown.`,
  };
}

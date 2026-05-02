// =====================================================================
// Prompt : generation des 30 requetes types pour la visibility tracking.
// Modele cible : Claude Sonnet 4.6 en mode JSON (cout ~0.01€/audit).
//
// 3 categories x 10 requetes = 30 :
//   - branded   : avec le nom de la marque ("Avis sur X", "X est-il fiable ?")
//   - service   : sans la marque, sur les services ("meilleur hotel a Y")
//   - comparative : comparaisons ("X vs Y", "alternative a X")
//
// IMPORTANT — Strategie LOCAL vs NATIONAL :
//   La pertinence du rapport pour un dirigeant local depend de la
//   localisation des questions. Une PME locale (Harmonie Yacht a Carnon)
//   ne se mesure pas contre Fraser Yachts (leader mondial). Si
//   business_scope = "local", on biaise les categories `service` et
//   `comparative` vers la ville (50%) et la region (30%), avec 20%
//   national pour comparer au marche large. Si "national", on garde
//   le comportement original (questions sectorielles nationales).
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

// Construit la directive geo selon le scope et les champs de
// localisation. Renvoie un block d'instruction multi-lignes integre
// au prompt user.
//
// SECURITE : on ne laisse JAMAIS un placeholder ("votre ville",
// "votre region") fuiter dans la directive — un placeholder leak
// finirait dans une vraie query envoyee aux 4 IA. Si scope='local'
// mais qu'aucune source de localisation utilisable n'est presente
// (city, region, geo_zone), on bascule en strategie 'national' et
// on logge un warning. C'est un bug grave que stepExtractBusiness
// devrait avoir absorbe via le hint user_geo_target ; cette garde
// est une derniere ligne de defense.
function buildGeoStrategy(business: BusinessInfo): string {
  const { business_scope, city, region, country, geo_zone } = business;

  if (business_scope === "local") {
    // On a besoin AU MOINS d'une chaine geographique non vide.
    // Priorite : city > region > geo_zone.
    const localityRaw = city || region || geo_zone || "";
    const localityClean = localityRaw.trim();

    if (!localityClean) {
      console.warn(
        "[queries-gen] business_scope='local' mais aucune localisation utilisable (city/region/geo_zone tous vides) — fallback en strategie nationale pour eviter un placeholder leak."
      );
      return buildNationalStrategy(business);
    }

    // city peut etre null mais region presente -> on pivote sur la region
    // comme "ville" (cas departement entier). region peut etre null aussi
    // -> on utilise la meme valeur pour les questions REGIONALES.
    const cityLabel = (city || region || geo_zone || localityClean).trim();
    const regionLabel = (region || country || "France").trim();
    const countryLabel = (country || "France").trim();

    return `STRATEGIE GEO — BUSINESS LOCAL :
Le business est ancre localement a ${cityLabel}${region && region !== cityLabel ? ` (${region})` : ""}${country ? `, ${country}` : ""}. La pertinence du rapport depend de la localisation des questions.
Repartition OBLIGATOIRE pour les 10 questions "service" :
  - 5 questions LOCALES mentionnant explicitement "${cityLabel}" (ex: "meilleur [service] a ${cityLabel}", "[service] a ${cityLabel}")
  - 3 questions REGIONALES mentionnant "${regionLabel}" (ex: "[service] dans ${regionLabel}", "ou trouver [service] en ${regionLabel}")
  - 2 questions NATIONALES sans mention geographique (pour comparer au marche large)
Meme repartition pour les 10 questions "comparative" :
  - 5 comparatives LOCALES (ex: "top 3 [services] a ${cityLabel}", "[concurrent local] vs autres [services] ${cityLabel}")
  - 3 comparatives REGIONALES (ex: "alternatives a [concurrent] en ${regionLabel}")
  - 2 comparatives NATIONALES (ex: "top 5 [secteur] en ${countryLabel}")
Les questions "branded" peuvent rester sans mention geographique (focus marque).
INTERDIT : ne genere JAMAIS de question contenant les mots "votre ville", "votre region", "[ville]", "[region]" ou tout placeholder. Utilise EXCLUSIVEMENT les valeurs reelles fournies.`;
  }

  if (business_scope === "international") {
    return `STRATEGIE GEO — BUSINESS INTERNATIONAL :
Le business opere sur plusieurs pays. Genere des questions sans ancrage local marque (mais accepte les regions larges type "Europe", "Mediterranee").
Si la langue principale est "fr", garde les questions en francais. Si "en", en anglais.`;
  }

  return buildNationalStrategy(business);
}

function buildNationalStrategy(business: BusinessInfo): string {
  const geoContext = business.geo_zone || business.country || "France";
  return `STRATEGIE GEO — BUSINESS NATIONAL :
Le business a une presence nationale (${geoContext}) sans ancrage local marque. Genere des questions sectorielles nationales. Tu PEUX integrer des mentions de regions/villes dans 1-2 questions service ou comparative pour simuler la geolocalisation, mais ne sur-localise pas.
INTERDIT : ne genere JAMAIS de question contenant les mots "votre ville", "votre region" ou tout autre placeholder. Utilise des villes/regions reelles francaises (Paris, Lyon, Marseille, Bordeaux...) ou pas de mention geographique du tout.`;
}

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

  const geoStrategy = buildGeoStrategy(business);

  return {
    system: `Tu es un expert en comportement de recherche conversationnelle. Tu generes des requetes realistes que des prospects poseraient a ChatGPT, Claude, Perplexity ou Gemini pour decouvrir un business comme celui-ci.

REGLES STRICTES :
- Requetes naturelles, conversationnelles (pas du SEO keyword stuffing)
- Format question complete OU intent explicite (pas juste "hotel paris")
- Pas de duplication, pas de variations triviales
- Pas de mentions de la marque dans les categories "service" et "comparative"
- Reponds UNIQUEMENT avec un JSON valide qui matche le schema.
- Respecte STRICTEMENT la strategie geographique imposee plus bas.`,
    prompt: `Genere 30 requetes pour tracker la visibilite IA du business suivant :

Marque : ${business.brand_name}
Variantes : ${business.brand_aliases.join(", ")}
Secteur : ${business.industry ?? "non precise"}
Services : ${business.services.join(", ")}
Localisation detectee :
  - Ville : ${business.city ?? "non detectee"}
  - Region : ${business.region ?? "non detectee"}
  - Pays : ${business.country ?? "non detecte"}
  - Echelle : ${business.business_scope}
Concurrents detectes : ${business.detected_competitors.join(", ") || "aucun detecte"}

${geoStrategy}

${langInstruction}

Format de reponse JSON :

{
  "branded": [
    "10 requetes qui mentionnent ${business.brand_name} explicitement",
    "exemples : 'Avis sur ${business.brand_name}', '${business.brand_name} est-il fiable ?', 'Que vaut ${business.brand_name} ?'"
  ],
  "service": [
    "10 requetes sur le service/secteur SANS mentionner ${business.brand_name}",
    "respecte la strategie geo imposee ci-dessus (50/30/20 si LOCAL)"
  ],
  "comparative": [
    "10 requetes comparatives ou alternatives",
    "respecte la strategie geo imposee ci-dessus (50/30/20 si LOCAL)"
  ]
}

Reponds UNIQUEMENT avec le JSON, sans texte autour, sans backticks markdown.`,
  };
}

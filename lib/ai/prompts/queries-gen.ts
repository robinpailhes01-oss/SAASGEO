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
// PIVOT STRATEGIQUE city_main : la majorite des prospects cherchent
// "hotel Montpellier" pas "hotel Carnon" (Montpellier = grande ville
// reference, Carnon = petite ville physique a 20km). Le split par
// niveau geographique est donc :
//
//   15 questions sur 30 -> city_main (ex: Montpellier)
//    6 questions sur 30 -> city_exact (ex: Carnon)
//    6 questions sur 30 -> region (ex: Hérault)
//    3 questions sur 30 -> national (sans geo)
//
// Si city_main n'est pas resolu, on retombe sur city_exact pour les
// 15 questions city_main (degrade mais fonctionnel).
//
// SECURITE : on ne laisse JAMAIS un placeholder ("votre ville",
// "votre region") fuiter dans la directive — un placeholder leak
// finirait dans une vraie query envoyee aux 4 IA.
function buildGeoStrategy(business: BusinessInfo): string {
  const {
    business_scope,
    city,
    city_main,
    region,
    country,
    geo_zone,
  } = business;

  if (business_scope === "local") {
    // Au minimum on a besoin d'une chaine geographique non vide.
    const localityRaw = city || city_main || region || geo_zone || "";
    if (!localityRaw.trim()) {
      console.warn(
        "[queries-gen] business_scope='local' mais aucune localisation utilisable (city/city_main/region/geo_zone tous vides) — fallback en strategie nationale pour eviter un placeholder leak."
      );
      return buildNationalStrategy(business);
    }

    // Niveaux geo (dans l'ordre de preference pour le split 15/6/6/3) :
    // 1) MAIN  = city_main (Montpellier) — 15 questions
    // 2) EXACT = city (Carnon)            —  6 questions
    // 3) REGION = region (Hérault)        —  6 questions
    // 4) NATIONAL                          —  3 questions
    //
    // Si city_main est null, on duplique city dans MAIN (degrade gracieux,
    // les 15 + 6 = 21 questions utilisent city_exact).
    const mainLabel = (city_main || city || geo_zone || localityRaw).trim();
    const exactLabel = (city || city_main || geo_zone || localityRaw).trim();
    const regionLabel = (region || country || "France").trim();
    const countryLabel = (country || "France").trim();
    const sameMainExact = mainLabel.toLowerCase() === exactLabel.toLowerCase();

    return `STRATEGIE GEO — BUSINESS LOCAL :
Le business est ancre physiquement a ${exactLabel}${region ? `, ${region}` : ""}${country ? `, ${country}` : ""}.${
  sameMainExact
    ? ""
    : ` La grande ville de reference proche est ${mainLabel} — c'est la que la majorite des prospects cherchent (ex: "hotel ${mainLabel}" plutot que "hotel ${exactLabel}").`
}

REPARTITION OBLIGATOIRE des 30 questions par niveau geographique :
${
  sameMainExact
    ? `- 21 questions mentionnant explicitement "${exactLabel}" (ville exacte = ville de reference)
- 6 questions mentionnant "${regionLabel}" (region/departement)
- 3 questions sans mention geographique (marche national)`
    : `- 15 questions mentionnant "${mainLabel}" (grande ville de reference, intention dominante des prospects)
- 6 questions mentionnant explicitement "${exactLabel}" (ville exacte du business)
- 6 questions mentionnant "${regionLabel}" (region/departement)
- 3 questions sans mention geographique (marche national)`
}

REPARTITION par categorie (indicatif, total = 30) :
- branded (10) : 5 avec ${mainLabel}, 3 avec ${exactLabel}, 2 sans geo (focus marque)
- service (10) : 5 avec ${mainLabel}, 2 avec ${exactLabel}, 2 avec ${regionLabel}, 1 national
- comparative (10) : 5 avec ${mainLabel}, 1 avec ${exactLabel}, 2 avec ${regionLabel}, 2 national
${
  sameMainExact
    ? "(Note : ville exacte = ville de reference, donc tous les '${mainLabel}' et '${exactLabel}' sont la meme valeur)"
    : ""
}

EXEMPLES de questions correctes :
- branded MAIN  : "Avis sur ${business.brand_name} ${mainLabel}"
- service MAIN  : "Meilleur [service] a ${mainLabel}"
- comparative MAIN : "Top 5 [services] a ${mainLabel} en ${countryLabel}"
- service EXACT : "[service] a ${exactLabel}"
- service REGION : "[service] dans ${regionLabel}"

INTERDIT ABSOLU : ne genere JAMAIS de question contenant les mots "votre ville", "votre region", "[ville]", "[region]", "[city]", "[location]" ou tout placeholder. Utilise EXCLUSIVEMENT les valeurs reelles fournies ci-dessus.`;
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

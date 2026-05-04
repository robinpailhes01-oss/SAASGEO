// =====================================================================
// Prompt : generation des 30 requetes types pour la visibility tracking.
// Modele cible : Claude Sonnet 4.6 en mode JSON (cout ~0.01€/audit).
//
// 3 categories x 10 requetes = 30 :
//   - branded   : avec le nom de la marque ("Avis sur X", "X est-il fiable ?")
//   - service   : sans la marque, sur les services ("meilleur hotel a Y")
//   - comparative : comparaisons ("X vs Y", "alternative a X")
//
// 3 axes strategiques superposes :
//
//  1) LANGAGE CLIENT vs jargon secteur (regle d'or)
//     Les vrais prospects ne tapent PAS "charter de yacht privatise" —
//     ils tapent "location bateau" ou "sortie en mer romantique".
//     Le system prompt impose un vocabulaire CLIENT (location, sortie,
//     nuit, activite, idee, que faire, etc.) plutot que le jargon
//     professionnel. Constat terrain : sur "location bateau Montpellier",
//     ChatGPT cite OBoat / Rent My Boat avant Harmonie Yacht — donc nos
//     audits doivent CIBLER ces requetes a forte intention reelle.
//
//  2) GEO LOCAL : split 15/6/6/3 (city_main / city_exact / region / national)
//     Une PME locale (Harmonie Yacht a Carnon) ne se mesure pas contre
//     Fraser Yachts (leader mondial). On bias les categories `service`
//     et `comparative` vers la grande ville de reference (Montpellier),
//     avec un repere ville exacte + region pour la comparaison locale.
//
//  3) DECOUVERTE LOCALE (quota obligatoire >= 3 questions)
//     "Que faire a Montpellier" / "Idee originale Montpellier" /
//     "Activite insolite Montpellier" — ces requetes a fort volume
//     sont celles ou les commerces locaux peuvent gagner de la
//     visibilite SANS etre directement cherches par leur nom.
//
//  + Keywords client (audits.keywords) injectes en priorite editoriale
//    forte si non vides : ils orientent le LANGAGE des questions et
//    pas seulement leur sujet.
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
    ? `(Note : ville exacte = ville de reference, donc tous les '${mainLabel}' et '${exactLabel}' sont la meme valeur)`
    : ""
}

QUOTA OBLIGATOIRE — REQUETES "DECOUVERTE LOCALE" :
Au moins 3 questions sur 30 doivent etre de la forme "decouverte" — celles qu'un prospect tape sans connaitre votre secteur. Ce sont les requetes les plus volumineuses sur lesquelles les commerces locaux peuvent gagner de la visibilite SANS etre directement cherches. Format type :
  - "Que faire a ${mainLabel}" / "Que faire a ${mainLabel} en couple" / "Que faire a ${mainLabel} en famille"
  - "Idee originale ${mainLabel}" / "Idee cadeau ${mainLabel}" / "Activite insolite ${mainLabel}"
  - "Sortie ${mainLabel} ce week-end" / "Activite ${mainLabel} pour anniversaire"
Place ces requetes en categorie "service" (elles sont sectorielles plus larges) ou "comparative" (top 5 / idees).

EXEMPLES de questions correctes :
- branded MAIN  : "Avis sur ${business.brand_name} ${mainLabel}"
- service MAIN (sectorielle) : "Location bateau ${mainLabel}" — langage CLIENT
- service MAIN (decouverte)  : "Que faire a ${mainLabel} en couple"
- comparative MAIN : "Top 5 [activites a faire] ${mainLabel}"
- service EXACT : "Sortie en mer ${exactLabel}"
- service REGION : "Activite insolite dans ${regionLabel}"

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

export function buildQueriesGenPrompt(
  business: BusinessInfo,
  options?: {
    // Mots-cles importants saisis par le client (audits.keywords).
    // Si presents, le LLM les utilise pour orienter les questions
    // vers la vraie cible client ("Activite romantique en mer
    // Montpellier" plutot que "Meilleur charter Montpellier").
    // ENRICHISSEMENT, jamais un remplacement : le split geo 15/6/6/3
    // et la repartition par categorie restent applicables.
    keywords?: string[];
  }
): {
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

  const keywords = (options?.keywords ?? [])
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  const keywordsBlock =
    keywords.length > 0
      ? `\n\nMOTS-CLES CLIENT (priorite editoriale forte) :
Le client a indique que ses prospects cherchent autour de ces themes : ${keywords.map((k) => `"${k}"`).join(", ")}.

Ces mots-cles sont LE LANGAGE DE LA VRAIE CIBLE — pas le jargon du secteur. Tu DOIS les integrer dans AU MOINS 10 des 30 questions, repartis intelligemment dans les categories service et comparative. Exemples de bonne integration si keywords=["romantique", "EVJF", "privatise"] :
  - "Sortie en mer romantique Montpellier"            (service, MAIN — intention forte)
  - "Idee EVJF originale Montpellier"                 (comparative, MAIN — discovery)
  - "Activite romantique Montpellier en couple"       (service, MAIN — discovery)
  - "Bateau privatise Montpellier anniversaire"       (service, MAIN — intention)
  - "Que faire a Montpellier pour un EVJF"            (service, MAIN — discovery)
Si un keyword ne s'applique pas naturellement a une question, ne l'integre pas — pas de "keyword stuffing" force.

Les keywords ORIENTENT le langage des questions, pas seulement leur sujet : si le client parle de "romantique" / "EVJF" / "privatise", c'est que ses vrais prospects parlent comme ca aussi. Adopte ce vocabulaire dans toutes les questions ou il s'applique, meme sans le keyword exact.`
      : "";

  return {
    system: `Tu es un expert en comportement de recherche conversationnelle. Tu generes des requetes REALISTES que des prospects taperaient a ChatGPT, Claude, Perplexity ou Gemini pour decouvrir un business comme celui-ci.

REGLE D'OR — LANGAGE CLIENT, PAS LANGAGE SECTEUR :
Tu ecris dans le vocabulaire des CLIENTS lambda, pas dans le jargon professionnel du secteur. Un client qui veut louer un yacht ne tape pas "charter de yacht privatise" — il tape "location bateau", "sortie en mer", "que faire a [ville]". Adopte le langage de la VRAIE cible commerciale.

EXEMPLES D'EQUIVALENTS (toujours preferer la colonne CLIENT) :
  - SECTEUR pro                  -> CLIENT lambda
  - "charter de yacht"           -> "location bateau"
  - "privatisation evenementielle" -> "bateau prive pour anniversaire"
  - "prestations hotelieres"     -> "ou dormir a [ville]"
  - "etablissement gastronomique" -> "ou bien manger a [ville]"
  - "cabinet d'avocats"          -> "trouver un avocat a [ville]"
  - "garage automobile"          -> "ou faire reviser ma voiture"
  - "salon de coiffure"          -> "coiffeur pas cher [ville]"

Vocabulaire client recurrent a privilegier : "location", "sortie", "nuit", "activite", "idee", "que faire", "ou aller", "ou trouver", "comment", "pas cher", "avis", "meilleur", "top", "originale", "insolite", "pour anniversaire", "en couple", "en famille".

Ce que les prospects CHERCHENT (pas ce que le secteur VEND) :
  - Une experience ("sortie en mer romantique") plutot qu'un service
  - Une occasion ("idee EVJF") plutot qu'une offre
  - Un besoin ("que faire a Montpellier ce week-end") plutot qu'un produit

REGLES STRICTES :
- Requetes naturelles, conversationnelles (pas du SEO keyword stuffing)
- Format question complete OU intent explicite (pas juste "hotel paris")
- Pas de duplication, pas de variations triviales
- Pas de mentions de la marque dans les categories "service" et "comparative"
- Reponds UNIQUEMENT avec un JSON valide qui matche le schema.
- Respecte STRICTEMENT la strategie geographique ET la strategie de langage imposees plus bas.
- INCLUS le quota obligatoire de 3+ requetes "decouverte locale" ("Que faire a [ville]" / "Idee originale [ville]" / "Activite insolite [ville]").`,
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

${geoStrategy}${keywordsBlock}

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

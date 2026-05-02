// =====================================================================
// Prompt : extraction du business depuis le HTML scrape.
// Modele cible : Claude Haiku 4.5 en mode JSON (cout ~0.0005€/audit).
//
// Phase localisation : on demande au LLM de detecter explicitement
// la ville / region / pays + de classifier l'echelle du business
// (local / national / international) pour driver la generation des
// 30 queries par stepGenerateQueries (cf. queries-gen.ts).
// =====================================================================

import { z } from "zod";

// Schema de validation de la reponse LLM
export const BusinessInfoSchema = z.object({
  brand_name: z.string().describe("Nom officiel du business / de la marque"),
  brand_aliases: z
    .array(z.string())
    .describe(
      "Variantes orthographiques pour la detection robuste de mention. Inclure : nom court, sans accents, abrege, version EN si applicable."
    ),
  industry: z
    .string()
    .nullable()
    .describe(
      "Secteur d'activite principal. Ex: 'Hotellerie de luxe', 'Charter de yachts', 'Restaurant gastronomique'."
    ),
  services: z
    .array(z.string())
    .describe("Liste des principaux services / produits proposes"),
  geo_zone: z
    .string()
    .nullable()
    .describe(
      "Zone geographique principale (forme libre). Ex: 'Paris 8e', 'Cote d'Azur', 'France'. null si non applicable. (Ce champ est conserve pour compatibilite — utiliser city/region/country pour les nouveaux usages.)"
    ),
  // ----- Localisation structuree (Phase localisation) ------------------
  city: z
    .string()
    .nullable()
    .describe(
      "Ville exacte detectee depuis le site (mention adresse, footer, page contact, schema.org). Ex: 'Carnon', 'Paris', 'Lyon'. null si non detectee."
    ),
  // Resolu en backend par city-resolver (pas demande au LLM ici, mais
  // accepte si le LLM le devine pour fallback). Le pipeline ecrasera
  // cette valeur via api-adresse.data.gouv.fr + nearest >50k hab.
  city_main: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Grande ville de reference (>50k hab) la plus proche. Resolu en backend. null par defaut."
    ),
  region: z
    .string()
    .nullable()
    .describe(
      "Region/departement detecte. Ex: 'Herault', 'Occitanie', 'Provence-Alpes-Cote d'Azur'. null si non detecte."
    ),
  country: z
    .string()
    .nullable()
    .describe("Pays detecte. Ex: 'France', 'Belgique'. null si non detecte."),
  business_scope: z
    .enum(["local", "national", "international"])
    .describe(
      "Echelle du business. local : ancrage geographique fort (PME locale, restaurant, hotel, charter local). national : presence nationale sans ancrage local fort (e-commerce FR, SaaS FR). international : marche multi-pays."
    ),
  // ----- Fin localisation ----------------------------------------------
  detected_competitors: z
    .array(z.string())
    .describe(
      "Concurrents potentiels mentionnes ou implicites dans le contenu (max 5)"
    ),
  language: z
    .enum(["fr", "en", "es", "de", "it", "other"])
    .describe("Langue principale du contenu"),
});

export type BusinessInfo = z.infer<typeof BusinessInfoSchema>;

// Construit le prompt complet pour l'extraction.
// homeText = texte visible scrape de la home (limite a ~3000 chars).
// userGeoTarget = ville fournie manuellement par l'utilisateur depuis
// le formulaire (optionnel). Si present, c'est la verite premiere — le
// LLM doit l'utiliser pour city/region et set scope='local'.
export function buildBrandExtractPrompt(
  homeText: string,
  url: string,
  userGeoTarget?: string | null
): {
  system: string;
  prompt: string;
} {
  const hasUserHint =
    typeof userGeoTarget === "string" && userGeoTarget.trim().length > 0;
  const hintBlock = hasUserHint
    ? `\n\nINDICATION UTILISATEUR — VERITE PREMIERE :
L'utilisateur a explicitement indique sa localisation : "${userGeoTarget!.trim()}".
- city = cette valeur (parse la ville en debut de chaine si plusieurs elements separes par virgule)
- region = element apres la virgule si present, sinon deduit du contexte
- business_scope = "local" (l'utilisateur a confirme une activite locale)
- geo_zone = la chaine complete fournie
NE CONTREDIS PAS cette information meme si le site est imprecis.`
    : "";

  return {
    system: `Tu es un analyste business specialise dans l'extraction de donnees structurees depuis des sites d'entreprise francais.
Reponds UNIQUEMENT avec un objet JSON valide qui matche exactement le schema demande.
Ne devine pas — si une information n'est pas presente dans le texte, mets null ou un array vide.

Localisation (PRIORITE ABSOLUE) : un dirigeant d'audit GEO a besoin de savoir si le business est ancre localement (Carnon, Hérault) pour generer des questions clients pertinentes ("yacht à Carnon" vs "yacht en Méditerranée"). Sources a parser dans l'ordre :
  1. Footer (mentions legales, adresse, code postal, ville)
  2. Page contact / a propos / nous trouver
  3. Schema.org LocalBusiness / Organization (postalAddress, addressLocality, addressRegion)
  4. Embeds Google Maps / iframe.google.com/maps
  5. Mentions explicites dans le texte ("Notre boutique a Lyon", "Situe en plein coeur de Bordeaux")
  6. Indices secondaires : numero de telephone (indicatif regional), TLD (.fr -> France probable)

Regles de classification business_scope :
  - "local"         : ville/adresse precise detectee, ou activite physique evidente (restaurant, hotel, boutique, garage, charter, salon de coiffure...)
  - "national"      : pas d'adresse precise mais marque francaise nationale (e-commerce FR, SaaS FR, marketplace)
  - "international" : presence multi-pays detectee (.com avec mentions multilingues, multiple currencies)

Si tu detectes une ville, REMPLIS OBLIGATOIREMENT city. Ne te contente pas de country='France' avec city=null — c'est inacceptable et casse l'audit.`,
    prompt: `Voici le contenu textuel de la page d'accueil de ${url} :

---
${homeText.slice(0, 3000)}
---${hintBlock}

Extrais les informations business au format JSON suivant. Sois EXIGEANT sur la localisation : c'est ce qui rendra l'audit credible pour un dirigeant local.

{
  "brand_name": "string (nom officiel de la marque)",
  "brand_aliases": ["array de variantes pour detection : nom court, sans accents, abrege, etc."],
  "industry": "string ou null (secteur d'activite)",
  "services": ["array des services/produits principaux"],
  "geo_zone": "string ou null (zone geographique principale en forme libre, ex: 'Carnon, Hérault')",
  "city": "string ou null (ville exacte detectee, ex: 'Carnon')",
  "region": "string ou null (departement ou region, ex: 'Hérault' ou 'Occitanie')",
  "country": "string ou null (pays, ex: 'France')",
  "business_scope": "local | national | international (regle ci-dessus)",
  "detected_competitors": ["array de concurrents detectes (max 5)"],
  "language": "fr | en | es | de | it | other"
}

Reponds UNIQUEMENT avec le JSON, sans texte autour, sans backticks markdown.`,
  };
}

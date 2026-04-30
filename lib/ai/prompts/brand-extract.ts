// =====================================================================
// Prompt : extraction du business depuis le HTML scrape.
// Modele cible : Claude Haiku 4.5 en mode JSON (cout ~0.0005€/audit).
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
      "Zone geographique principale (ville/region/pays). Ex: 'Paris 8e', 'Cote d'Azur', 'France'. null si non applicable."
    ),
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
export function buildBrandExtractPrompt(homeText: string, url: string): {
  system: string;
  prompt: string;
} {
  return {
    system: `Tu es un analyste business specialise dans l'extraction de donnees structurees depuis des sites d'entreprise.
Reponds UNIQUEMENT avec un objet JSON valide qui matche exactement le schema demande.
Ne devine pas — si une information n'est pas presente dans le texte, mets null ou un array vide.`,
    prompt: `Voici le contenu textuel de la page d'accueil de ${url} :

---
${homeText.slice(0, 3000)}
---

Extrais les informations business au format JSON suivant :

{
  "brand_name": "string (nom officiel de la marque)",
  "brand_aliases": ["array de variantes pour detection : nom court, sans accents, abrege, etc."],
  "industry": "string ou null (secteur d'activite)",
  "services": ["array des services/produits principaux"],
  "geo_zone": "string ou null (zone geographique principale)",
  "detected_competitors": ["array de concurrents detectes (max 5)"],
  "language": "fr | en | es | de | it | other"
}

Reponds UNIQUEMENT avec le JSON, sans texte autour.`,
  };
}

// =====================================================================
// Types partages pour le module scraping et l'audit technique.
// =====================================================================

export type TechCategory =
  | "foundations"
  | "geo_triptych"
  | "structured_data"
  | "content"
  | "authority";

export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

// Resultat d'une verification individuelle (1 check = 1 critere).
// Format aligne avec la spec D phase 0 et la table audit_technical.checks.
export interface CheckResult {
  id: string;                         // identifiant stable (ex: "robots_gptbot_allowed")
  category: TechCategory;
  label: string;                      // texte humain en francais
  status: CheckStatus;
  points_earned: number;
  points_max: number;
  evidence?: string;                  // preuve texte/snippet/url qui justifie le statut
  recommendation?: string;            // action concrete si fail/warn (jamais sur pass)
}

export interface CategoryResult {
  category: TechCategory;
  label: string;                      // libelle FR de la categorie
  score: number;                      // 0-20
  max_score: 20;
  checks: CheckResult[];
}

export type FetchMethod = "fetch" | "jina" | "browserless" | "cached";

// Donnees brutes recoltees par le module fetcher.
// L'audit technique consomme ces donnees pour produire les checks.
export interface SiteData {
  url: string;
  url_normalized: string;
  fetched_at: string;                 // ISO date
  // HTML de la home page
  home_html: string;
  home_status: number;                // code HTTP
  home_method: FetchMethod;           // methode utilisee pour la home
  home_headers: Record<string, string>;

  // Robots et sitemap
  robots_txt: string | null;          // contenu brut, null si 404
  robots_status: number | null;
  sitemap_xml: string | null;
  sitemap_status: number | null;
  sitemap_url: string;                // url tentee

  // Triptyque GEO
  llms_txt: string | null;
  llms_full_txt: string | null;

  // Pages echantillon (sample des liens internes)
  sampled_pages: SampledPage[];

  // Metadata HTTPS
  protocol: "http" | "https";
  redirect_chain: string[];           // chaine de redirects observee sur la home
}

export interface SampledPage {
  url: string;
  status: number;
  html: string | null;                // null si echec fetch
  method: FetchMethod;
  // Optionnel : version .md de la page (pour check geo_triptych)
  md_status?: number | null;
  md_content?: string | null;
}

// Resultat complet de l'audit technique (5 categories).
export interface TechAuditResult {
  url: string;
  url_normalized: string;
  domain: string;
  fetched_at: string;
  duration_ms: number;
  language: string | null;
  // Score global /100 (somme des 5 categories /20)
  total_score: number;
  categories: CategoryResult[];
  // Quelques metadonnees utiles pour debugging et le rapport
  metadata: {
    fetch_methods_used: FetchMethod[];
    sampled_pages_count: number;
    has_sitemap: boolean;
    has_robots: boolean;
    has_llms_txt: boolean;
    is_spa: boolean;
    // True si la page recue ressemble a un challenge anti-bot
    // (Vercel Security Checkpoint, Cloudflare Turnstile, etc.).
    // Implique que tout l'audit est probablement biaise et le score
    // tres bas est en lui-meme un signal GEO majeur (les IA aussi
    // sont bloquees).
    is_anti_bot_blocked: boolean;
    anti_bot_signal?: string;
  };
}

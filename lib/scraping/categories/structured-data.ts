// =====================================================================
// Categorie 3 : Structured data (JSON-LD) (20 pts)
// =====================================================================

import type { CheckResult, SiteData } from "../types";
import {
  loadHtml,
  extractJsonLd,
  flattenJsonLd,
  findSchemasByType,
} from "../parser";

const CAT = "structured_data" as const;

// Detecte si un schema est probablement un local business (vs SaaS pur)
// → si oui, on require LocalBusiness/Hotel/Restaurant
function detectLocalBusinessIntent(
  flat: Record<string, unknown>[],
  homeHtml: string
): boolean {
  // 1. Si schema deja LocalBusiness/Hotel/Restaurant → OUI
  const localTypes = [
    "LocalBusiness",
    "Hotel",
    "Restaurant",
    "Store",
    "BedAndBreakfast",
    "Resort",
    "TouristAttraction",
    "LodgingBusiness",
  ];
  if (findSchemasByType(flat, localTypes).length > 0) return true;

  // 2. Heuristique HTML : telephone + adresse visible
  const lowerHtml = homeHtml.toLowerCase();
  const hasAddress =
    /\b(adresse|address|rue|avenue|boulevard|street)\b/.test(lowerHtml);
  const hasPhone = /(\+?[\d\s().-]{8,})/g.test(lowerHtml);
  const tourismKeywords = /\b(hotel|restaurant|chambre|reservation|sejour|booking|spa|villa|yacht|charter)\b/.test(
    lowerHtml
  );

  return (hasAddress && hasPhone) || tourismKeywords;
}

interface Ctx {
  siteData: SiteData;
}

export async function runStructuredData(ctx: Ctx): Promise<CheckResult[]> {
  const { siteData } = ctx;
  const checks: CheckResult[] = [];

  const $ = loadHtml(siteData.home_html);
  const blocks = extractJsonLd($);
  const flat = flattenJsonLd(blocks);

  const isLocalBusiness = detectLocalBusinessIntent(flat, siteData.home_html);
  const hasParseErrors = blocks.some((b) => b.parseError);

  // ---- 3.1 Organization schema (3 pts) ----
  const orgSchemas = findSchemasByType(flat, ["Organization"]);
  const hasOrg = orgSchemas.length > 0;
  let orgScore = 0;
  let orgEvidence = "";

  if (hasOrg) {
    const o = orgSchemas[0];
    const hasName = !!o.name;
    const hasUrl = !!o.url;
    const hasLogo = !!o.logo;
    const filledFields = [hasName, hasUrl, hasLogo].filter(Boolean).length;
    if (filledFields === 3) orgScore = 3;
    else if (filledFields === 2) orgScore = 2;
    else if (filledFields === 1) orgScore = 1;
    orgEvidence = `Organization detecte (name=${hasName}, url=${hasUrl}, logo=${hasLogo})`;
  } else {
    orgEvidence = "Aucun schema Organization detecte dans le JSON-LD";
  }

  checks.push({
    id: "schema_organization",
    category: CAT,
    label: "Schema Organization complet",
    status: orgScore === 3 ? "pass" : orgScore >= 1 ? "warn" : "fail",
    points_earned: orgScore,
    points_max: 3,
    evidence: orgEvidence,
    recommendation:
      orgScore === 3
        ? undefined
        : "Ajouter un schema JSON-LD Organization avec au minimum @type, name, url, logo. Cf. schema.org/Organization.",
  });

  // ---- 3.2 LocalBusiness/Hotel/Restaurant si applicable (3 pts) ----
  if (isLocalBusiness) {
    const lbSchemas = findSchemasByType(flat, [
      "LocalBusiness",
      "Hotel",
      "Restaurant",
      "Store",
      "BedAndBreakfast",
      "Resort",
      "TouristAttraction",
      "LodgingBusiness",
    ]);
    const hasLb = lbSchemas.length > 0;
    checks.push({
      id: "schema_local_business",
      category: CAT,
      label: "Schema LocalBusiness / Hotel / Restaurant",
      status: hasLb ? "pass" : "fail",
      points_earned: hasLb ? 3 : 0,
      points_max: 3,
      evidence: hasLb
        ? `Detecte : ${lbSchemas.map((s) => s["@type"]).join(", ")}`
        : "Site detecte comme local business mais aucun schema LocalBusiness/Hotel/Restaurant",
      recommendation: hasLb
        ? undefined
        : "Ajouter un schema JSON-LD du type approprie (Hotel, Restaurant, LocalBusiness, etc.) pour aider les IA a categoriser le business.",
    });

    // ---- 3.3 Address + phone + opening hours dans LocalBusiness (2 pts) ----
    if (hasLb) {
      const lb = lbSchemas[0];
      const hasAddress = !!(lb.address || lb["address"]);
      const hasPhone = !!(lb.telephone || lb["telephone"]);
      const hasHours = !!(lb.openingHours || lb.openingHoursSpecification);
      const filled = [hasAddress, hasPhone, hasHours].filter(Boolean).length;
      let score = 0;
      if (filled === 3) score = 2;
      else if (filled === 2) score = 1;

      checks.push({
        id: "schema_local_complete",
        category: CAT,
        label: "LocalBusiness complet (adresse + telephone + horaires)",
        status: score === 2 ? "pass" : score === 1 ? "warn" : "fail",
        points_earned: score,
        points_max: 2,
        evidence: `address=${hasAddress}, telephone=${hasPhone}, openingHours=${hasHours}`,
        recommendation:
          score === 2
            ? undefined
            : "Completer le schema LocalBusiness : address (PostalAddress), telephone, openingHoursSpecification.",
      });
    } else {
      checks.push({
        id: "schema_local_complete",
        category: CAT,
        label: "LocalBusiness complet (adresse + telephone + horaires)",
        status: "fail",
        points_earned: 0,
        points_max: 2,
        evidence: "LocalBusiness absent",
      });
    }
  } else {
    // Site non-local : checks non applicables → skipped (ne reduit pas le score)
    checks.push({
      id: "schema_local_business",
      category: CAT,
      label: "Schema LocalBusiness / Hotel / Restaurant",
      status: "skipped",
      points_earned: 0,
      points_max: 3,
      evidence: "Site non identifie comme local business — check non applicable",
    });
    checks.push({
      id: "schema_local_complete",
      category: CAT,
      label: "LocalBusiness complet (adresse + telephone + horaires)",
      status: "skipped",
      points_earned: 0,
      points_max: 2,
      evidence: "Non applicable",
    });
  }

  // ---- 3.4 Product / Service schema (3 pts) ----
  const productServiceSchemas = findSchemasByType(flat, [
    "Product",
    "Service",
    "Offer",
  ]);
  const hasPS = productServiceSchemas.length > 0;
  checks.push({
    id: "schema_product_service",
    category: CAT,
    label: "Schema Product / Service / Offer",
    status: hasPS ? "pass" : "warn",
    points_earned: hasPS ? 3 : 0,
    points_max: 3,
    evidence: hasPS
      ? `${productServiceSchemas.length} schema(s) Product/Service/Offer detecte(s)`
      : "Aucun schema Product/Service/Offer",
    recommendation: hasPS
      ? undefined
      : "Ajouter des schemas Product (e-commerce), Service (prestations) ou Offer (offres) pour preciser ce que le business propose.",
  });

  // ---- 3.5 FAQPage schema (3 pts) ----
  const faqSchemas = findSchemasByType(flat, ["FAQPage", "QAPage"]);
  const hasFaq = faqSchemas.length > 0;
  checks.push({
    id: "schema_faq",
    category: CAT,
    label: "Schema FAQPage / QAPage",
    status: hasFaq ? "pass" : "warn",
    points_earned: hasFaq ? 3 : 0,
    points_max: 3,
    evidence: hasFaq
      ? `${faqSchemas.length} schema(s) FAQ detecte(s)`
      : "Aucun schema FAQPage",
    recommendation: hasFaq
      ? undefined
      : "Ajouter une page FAQ avec schema FAQPage pour permettre aux IA de citer directement vos reponses aux questions frequentes.",
  });

  // ---- 3.6 Review / AggregateRating (2 pts) ----
  const reviewSchemas = findSchemasByType(flat, [
    "Review",
    "AggregateRating",
  ]);
  // Aussi chercher dans les autres schemas (souvent embed dans Hotel/Product)
  const embeddedRatings = flat.filter(
    (s) => s.aggregateRating || s.review
  );
  const hasReview = reviewSchemas.length > 0 || embeddedRatings.length > 0;
  checks.push({
    id: "schema_review_rating",
    category: CAT,
    label: "Schema Review / AggregateRating",
    status: hasReview ? "pass" : "warn",
    points_earned: hasReview ? 2 : 0,
    points_max: 2,
    evidence: hasReview
      ? `${reviewSchemas.length} Review, ${embeddedRatings.length} AggregateRating embedded`
      : "Aucune note / avis structurees",
    recommendation: hasReview
      ? undefined
      : "Si vous avez des avis clients, les structurer en JSON-LD avec Review et/ou AggregateRating pour augmenter la credibilite aupres des IA.",
  });

  // ---- 3.7 BreadcrumbList (1 pt) ----
  const bcSchemas = findSchemasByType(flat, ["BreadcrumbList"]);
  const hasBc = bcSchemas.length > 0;
  checks.push({
    id: "schema_breadcrumb",
    category: CAT,
    label: "Schema BreadcrumbList",
    status: hasBc ? "pass" : "warn",
    points_earned: hasBc ? 1 : 0,
    points_max: 1,
    evidence: hasBc
      ? `${bcSchemas.length} BreadcrumbList`
      : "Aucun BreadcrumbList",
    recommendation: hasBc
      ? undefined
      : "Ajouter un schema BreadcrumbList pour aider les IA a comprendre la hierarchie de navigation.",
  });

  // ---- 3.8 Article / BlogPosting (2 pts) ----
  const articleSchemas = findSchemasByType(flat, [
    "Article",
    "BlogPosting",
    "NewsArticle",
  ]);
  const hasArticle = articleSchemas.length > 0;
  // Detection si le site a un blog (pour decider si applicable)
  const hasBlog = /\b(blog|news|actualit|article)\b/i.test(siteData.home_html);
  if (hasBlog) {
    checks.push({
      id: "schema_article",
      category: CAT,
      label: "Schema Article / BlogPosting (si blog detecte)",
      status: hasArticle ? "pass" : "warn",
      points_earned: hasArticle ? 2 : 0,
      points_max: 2,
      evidence: hasArticle
        ? `${articleSchemas.length} Article(s)`
        : "Blog detecte mais aucun schema Article",
      recommendation: hasArticle
        ? undefined
        : "Structurer les articles de blog en JSON-LD Article ou BlogPosting (auteur, date, titre, image).",
    });
  } else {
    checks.push({
      id: "schema_article",
      category: CAT,
      label: "Schema Article / BlogPosting (si blog detecte)",
      status: "skipped",
      points_earned: 0,
      points_max: 2,
      evidence: "Pas de blog detecte sur la home",
    });
  }

  // ---- 3.9 Aucun warning/error JSON-LD (1 pt) ----
  checks.push({
    id: "schema_no_errors",
    category: CAT,
    label: "JSON-LD parse sans erreur",
    status: blocks.length === 0 ? "skipped" : hasParseErrors ? "fail" : "pass",
    points_earned: blocks.length === 0 ? 0 : hasParseErrors ? 0 : 1,
    points_max: 1,
    evidence:
      blocks.length === 0
        ? "Aucun bloc JSON-LD a tester"
        : hasParseErrors
          ? `${blocks.filter((b) => b.parseError).length}/${blocks.length} blocs avec erreurs de parse`
          : `${blocks.length} blocs JSON-LD parses correctement`,
    recommendation: hasParseErrors
      ? "Corriger les erreurs JSON dans les blocs <script type=\"application/ld+json\">. Valider via validator.schema.org."
      : undefined,
  });

  return checks;
}

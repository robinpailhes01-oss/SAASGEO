// =====================================================================
// Categorie 4 : Contenu optimise (20 pts)
// Hierarchie titres, FAQ, densite conversationnelle, alt text, lisibilite.
// =====================================================================

import type { CheckResult, SiteData } from "../types";
import {
  loadHtml,
  extractMeta,
  extractHeadings,
  isQuestion,
  extractImageStats,
  countVisibleWords,
  extractVisibleText,
} from "../parser";

const CAT = "content" as const;

interface Ctx {
  siteData: SiteData;
}

export async function runContent(ctx: Ctx): Promise<CheckResult[]> {
  const { siteData } = ctx;
  const checks: CheckResult[] = [];

  const $ = loadHtml(siteData.home_html);
  const meta = extractMeta($);
  const headings = extractHeadings($);

  // ---- 4.1 Un seul H1 par page (2 pts) ----
  const h1Count = headings.h1.length;
  let h1Score = 0;
  let h1Status: "pass" | "warn" | "fail" = "fail";
  if (h1Count === 1) {
    h1Score = 2;
    h1Status = "pass";
  } else if (h1Count === 0) {
    h1Status = "fail";
  } else {
    h1Score = 1;
    h1Status = "warn";
  }
  checks.push({
    id: "content_h1_unique",
    category: CAT,
    label: "Un seul H1 par page (home)",
    status: h1Status,
    points_earned: h1Score,
    points_max: 2,
    evidence:
      h1Count === 1
        ? `H1 : "${headings.h1[0].slice(0, 80)}"`
        : `${h1Count} H1 detectes${h1Count > 0 ? ` : ${headings.h1.slice(0, 3).map((h) => `"${h.slice(0, 50)}"`).join(", ")}` : ""}`,
    recommendation:
      h1Score === 2
        ? undefined
        : h1Count === 0
          ? "Ajouter un titre H1 unique en haut de la page (descriptif du contenu de la page)."
          : "Conserver un seul H1 par page. Convertir les autres H1 en H2 ou H3 selon hierarchie.",
  });

  // ---- 4.2 Hierarchie H2/H3 logique (2 pts) ----
  const hasH2 = headings.h2.length > 0;
  const hasH3OrLessProperly =
    headings.h3.length === 0 || headings.h2.length > 0; // pas de H3 sans H2
  let hierScore = 0;
  if (hasH2 && hasH3OrLessProperly) hierScore = 2;
  else if (hasH2) hierScore = 1;
  checks.push({
    id: "content_heading_hierarchy",
    category: CAT,
    label: "Hierarchie H2/H3 logique",
    status: hierScore === 2 ? "pass" : hierScore === 1 ? "warn" : "fail",
    points_earned: hierScore,
    points_max: 2,
    evidence: `H1=${headings.h1.length}, H2=${headings.h2.length}, H3=${headings.h3.length}`,
    recommendation:
      hierScore === 2
        ? undefined
        : "Structurer le contenu avec H2 pour les sections principales et H3 pour les sous-sections. Eviter les H3 sans H2 parent.",
  });

  // ---- 4.3 Title tags (2 pts) ----
  const title = meta.title ?? "";
  const titleLen = title.length;
  let titleScore = 0;
  let titleStatus: "pass" | "warn" | "fail" = "fail";
  if (title && titleLen >= 30 && titleLen <= 65) {
    titleScore = 2;
    titleStatus = "pass";
  } else if (title) {
    titleScore = 1;
    titleStatus = "warn";
  }
  checks.push({
    id: "content_title_tag",
    category: CAT,
    label: "Title tag bien forme (30-65 chars)",
    status: titleStatus,
    points_earned: titleScore,
    points_max: 2,
    evidence: title
      ? `"${title}" (${titleLen} chars)`
      : "<title> manquant",
    recommendation:
      titleScore === 2
        ? undefined
        : !title
          ? "Ajouter une balise <title> dans le <head>."
          : titleLen < 30
            ? "Title trop court — viser 30-65 chars pour optimum SEO/IA."
            : "Title trop long — viser 30-65 chars (au-dela, tronque dans les SERP).",
  });

  // ---- 4.4 Meta description (2 pts) ----
  const descLen = meta.description?.length ?? 0;
  let descScore = 0;
  let descStatus: "pass" | "warn" | "fail" = "fail";
  if (meta.description && descLen >= 110 && descLen <= 165) {
    descScore = 2;
    descStatus = "pass";
  } else if (meta.description) {
    descScore = 1;
    descStatus = "warn";
  }
  checks.push({
    id: "content_meta_description",
    category: CAT,
    label: "Meta description bien formee (110-165 chars)",
    status: descStatus,
    points_earned: descScore,
    points_max: 2,
    evidence: meta.description
      ? `"${meta.description.slice(0, 100)}..." (${descLen} chars)`
      : "Meta description absente",
    recommendation:
      descScore === 2
        ? undefined
        : !meta.description
          ? "Ajouter une <meta name=\"description\"> claire et engageante."
          : "Ajuster la longueur de la meta description (110-165 chars).",
  });

  // ---- 4.5 FAQ structurees (3 pts) ----
  // Heuristique : nombre de questions parmi les H2/H3 + presence de section FAQ
  const allHeadings = [...headings.h2, ...headings.h3];
  const questionsInHeadings = allHeadings.filter(isQuestion);
  const hasFaqSection =
    /\bf\.?a\.?q\.?\b|\bquestions?\s*frequentes\b|\bfrequently\s*asked\b/i.test(
      siteData.home_html
    );
  const ratio =
    allHeadings.length > 0
      ? questionsInHeadings.length / allHeadings.length
      : 0;

  let faqScore = 0;
  if (questionsInHeadings.length >= 3 && hasFaqSection) faqScore = 3;
  else if (questionsInHeadings.length >= 3 || hasFaqSection) faqScore = 2;
  else if (questionsInHeadings.length >= 1) faqScore = 1;

  checks.push({
    id: "content_faq_structured",
    category: CAT,
    label: "FAQ structurees avec questions completes",
    status: faqScore === 3 ? "pass" : faqScore >= 1 ? "warn" : "fail",
    points_earned: faqScore,
    points_max: 3,
    evidence: `${questionsInHeadings.length} question(s) en H2/H3, section FAQ detectee=${hasFaqSection}`,
    recommendation:
      faqScore === 3
        ? undefined
        : "Creer une section FAQ avec au moins 3 questions completes (structurees en H2/H3) reflectant les vraies questions des prospects.",
  });

  // ---- 4.6 Densite conversationnelle (3 pts) ----
  // % H2 qui sont des questions completes
  const h2Questions = headings.h2.filter(isQuestion);
  const h2QRatio =
    headings.h2.length > 0 ? h2Questions.length / headings.h2.length : 0;

  let convScore = 0;
  if (h2QRatio >= 0.3) convScore = 3;
  else if (h2QRatio >= 0.15) convScore = 2;
  else if (h2QRatio > 0) convScore = 1;

  checks.push({
    id: "content_conversational_density",
    category: CAT,
    label: "Densite conversationnelle (>=30% H2 sont des questions)",
    status: convScore === 3 ? "pass" : convScore >= 1 ? "warn" : "fail",
    points_earned: convScore,
    points_max: 3,
    evidence: `${h2Questions.length}/${headings.h2.length} H2 sont des questions completes (${Math.round(h2QRatio * 100)}%)`,
    recommendation:
      convScore === 3
        ? undefined
        : "Reformuler des H2 en questions completes (\"Comment...\", \"Pourquoi...\", \"Que faire si...\"). Les IA preferent ce format pour les citations directes.",
  });

  // ---- 4.7 Answer-first patterns (2 pts) ----
  // Heuristique : pour chaque H2-question, le paragraphe suivant fait < 200 chars
  // et commence par une affirmation directe (pas de "Bienvenue" / "Notre" / etc.)
  let answerFirstCount = 0;
  let totalQuestions = 0;
  $("h2, h3").each((_, h) => {
    const headingText = $(h).text().trim();
    if (!isQuestion(headingText)) return;
    totalQuestions += 1;
    // On regarde le premier element textuel apres le heading
    const next = $(h).next("p, div").first();
    if (next.length === 0) return;
    const nextText = next.text().trim();
    if (nextText && nextText.length < 250) {
      // Considere "answer-first" si commence directement par un verbe d'affirmation
      const startsWell =
        /^(oui|non|le|la|les|notre|nous|c'est|il s'agit|cela|pour|en|si|quand|nos|cette)\b/i.test(
          nextText
        );
      if (startsWell) answerFirstCount += 1;
    }
  });

  let afScore = 0;
  if (totalQuestions === 0) {
    afScore = 0;
  } else {
    const afRatio = answerFirstCount / totalQuestions;
    if (afRatio >= 0.6) afScore = 2;
    else if (afRatio >= 0.3) afScore = 1;
  }

  checks.push({
    id: "content_answer_first",
    category: CAT,
    label: "Reponses claires en debut de section (answer-first)",
    status: afScore === 2 ? "pass" : afScore === 1 ? "warn" : totalQuestions === 0 ? "skipped" : "fail",
    points_earned: afScore,
    points_max: 2,
    evidence:
      totalQuestions === 0
        ? "Aucune question detectee dans les H2/H3"
        : `${answerFirstCount}/${totalQuestions} questions ont une reponse "answer-first" detectee (heuristique)`,
    recommendation:
      afScore === 2
        ? undefined
        : "Apres chaque question (H2/H3), commencer le paragraphe par une affirmation directe. Les IA citent ces formulations en priorite.",
  });

  // ---- 4.8 Alt text sur >=80% images (2 pts) ----
  const img = extractImageStats($);
  if (img.total === 0) {
    checks.push({
      id: "content_alt_text",
      category: CAT,
      label: "Alt text sur >=80% des images",
      status: "skipped",
      points_earned: 0,
      points_max: 2,
      evidence: "Aucune image detectee sur la home",
    });
  } else {
    const ratio = img.withMeaningfulAlt / img.total;
    let altScore = 0;
    if (ratio >= 0.8) altScore = 2;
    else if (ratio >= 0.5) altScore = 1;
    checks.push({
      id: "content_alt_text",
      category: CAT,
      label: "Alt text sur >=80% des images",
      status: altScore === 2 ? "pass" : altScore === 1 ? "warn" : "fail",
      points_earned: altScore,
      points_max: 2,
      evidence: `${img.withMeaningfulAlt}/${img.total} images ont un alt significatif (${Math.round(ratio * 100)}%)`,
      recommendation:
        altScore === 2
          ? undefined
          : "Ajouter un attribut alt descriptif (>3 chars) a toutes les images (accessibilite + indexation IA).",
    });
  }

  // ---- 4.9 Pages services > 500 mots (1 pt) ----
  // On regarde les pages echantillonnees qui contiennent "service" dans l'URL
  const servicePages = siteData.sampled_pages.filter(
    (p) => /service|prestation|offre/i.test(p.url) && p.html
  );
  if (servicePages.length === 0) {
    // Fallback : on prend juste le wordcount de la home
    const homeWords = countVisibleWords($);
    const pass = homeWords >= 500;
    checks.push({
      id: "content_word_count",
      category: CAT,
      label: "Contenu suffisant (>=500 mots sur home/service)",
      status: pass ? "pass" : "warn",
      points_earned: pass ? 1 : 0,
      points_max: 1,
      evidence: `Home : ${homeWords} mots (pas de page service identifiee)`,
      recommendation: pass
        ? undefined
        : "Etoffer le contenu textuel : viser >=500 mots sur les pages principales pour donner aux IA assez de contexte.",
    });
  } else {
    const counts = servicePages.map((p) => {
      if (!p.html) return 0;
      const $$ = loadHtml(p.html);
      return countVisibleWords($$);
    });
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const pass = avg >= 500;
    checks.push({
      id: "content_word_count",
      category: CAT,
      label: "Pages services > 500 mots",
      status: pass ? "pass" : "warn",
      points_earned: pass ? 1 : 0,
      points_max: 1,
      evidence: `${servicePages.length} page(s) service, moyenne ${Math.round(avg)} mots`,
      recommendation: pass
        ? undefined
        : "Etoffer les pages services pour atteindre au moins 500 mots de contenu textuel utile.",
    });
  }

  // ---- 4.10 Lisibilite (1 pt) — heuristique simple ----
  // On approxime le Flesch-Kincaid via : phrases moyennes courtes + mots courts
  const text = extractVisibleText($).slice(0, 5000); // sample limite pour perf
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  const words = text.split(/\s+/).filter(Boolean);
  if (sentences.length === 0 || words.length === 0) {
    checks.push({
      id: "content_readability",
      category: CAT,
      label: "Lisibilite (phrases courtes, mots courts)",
      status: "skipped",
      points_earned: 0,
      points_max: 1,
      evidence: "Pas assez de texte pour mesurer",
    });
  } else {
    const avgSentenceLen = words.length / sentences.length;
    const avgWordLen =
      words.reduce((a, b) => a + b.length, 0) / words.length;
    // Phrases < 25 mots et mots < 6 chars en moyenne = bon
    const goodSentence = avgSentenceLen <= 25;
    const goodWord = avgWordLen <= 6.5;
    const pass = goodSentence && goodWord;

    checks.push({
      id: "content_readability",
      category: CAT,
      label: "Lisibilite (phrases courtes, mots courts)",
      status: pass ? "pass" : "warn",
      points_earned: pass ? 1 : 0,
      points_max: 1,
      evidence: `Phrase moyenne ${avgSentenceLen.toFixed(1)} mots, mot moyen ${avgWordLen.toFixed(1)} chars`,
      recommendation: pass
        ? undefined
        : "Raccourcir les phrases (viser <25 mots) et privilegier des mots simples (<6 chars en moyenne) pour ameliorer la lisibilite IA.",
    });
  }

  return checks;
}

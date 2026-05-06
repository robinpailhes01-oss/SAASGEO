// =====================================================================
// /audit/[id] — page rapport publique (Phase D).
//
// Server Component qui :
//   - valide l'UUID
//   - fetch le rapport agreges via lib/report/get-report
//   - 404 si l'audit n'existe pas
//   - redirect vers /progress si l'audit n'est pas encore termine
//   - affiche un message de panne clair si status === "failed"
//   - rend le rapport complet sinon
//
// SEO : meta noindex stricte (rapports prives) + OpenGraph dynamique
// pour partage interne (lien Slack, email...).
//
// La page est volontairement decoupee en blocs Phase D.1 -> D.4 :
//   D.1 : ScoreHero, Verdict, LostOpportunities  (en place)
//   D.2 : TopCompetitors, AIResponsePreview      (a venir)
//   D.3 : WhyInvisible, PriorityActions, Urgency (a venir)
//   D.4 : MainCta, EmailCapture (ChallengeCompetitor retire — pas
//         d'incitation a auditer un autre site dans le rapport,
//         focus 100% sur la conversion CTA Calendly)
// =====================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getReport } from "@/lib/report/get-report";
import { ReportLayout } from "@/components/report/ReportLayout";
import { ScoreHero } from "@/components/report/ScoreHero";
import { Verdict } from "@/components/report/Verdict";
import { LostOpportunities } from "@/components/report/LostOpportunities";
import { TopCompetitors } from "@/components/report/TopCompetitors";
import { KnownCompetitorsPanel } from "@/components/report/KnownCompetitorsPanel";
import { AIResponsePreview } from "@/components/report/AIResponsePreview";
import { AllQueriesPanel } from "@/components/report/AllQueriesPanel";
import { LocationWarning } from "@/components/report/LocationWarning";
import { WhyInvisible } from "@/components/report/WhyInvisible";
import { PriorityActions } from "@/components/report/PriorityActions";
import { UrgencyReminder } from "@/components/report/UrgencyReminder";
import { MainCta } from "@/components/report/MainCta";
import { EmailCapture } from "@/components/report/EmailCapture";
import { PoweredByAnkora } from "@/components/report/PoweredByAnkora";
import { ManualQueries } from "@/components/report/ManualQueries";
import { EvolutionPanel } from "@/components/report/EvolutionPanel";
import { getManualQueries } from "@/lib/report/get-manual-queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Forcer le rendu dynamique : pas de cache, on lit la donnee a chaque hit
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------
// Meta SEO dynamique : titre + OG image avec score (image OG generee
// statiquement en Phase E, placeholder ici).
// ---------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const report = await getReport(params.id);
  if (!report) {
    return {
      title: "Rapport introuvable — Ankora",
      robots: { index: false, follow: false },
    };
  }
  const score =
    report.status === "done" ? Math.round(report.global_score) : null;
  const title = score
    ? `Audit Ankora pour ${report.hostname} : ${score}/100`
    : `Audit en cours pour ${report.hostname} — Ankora`;
  return {
    title,
    description:
      "Votre rapport de visibilité dans les IA conversationnelles (ChatGPT, Claude, Perplexity, Gemini).",
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description:
        "Découvrez si votre marque est citée par les IA conversationnelles.",
      type: "article",
    },
  };
}

// ---------------------------------------------------------------------
// Sous-vue : audit en echec (status=failed)
// ---------------------------------------------------------------------
function FailedReportView({ hostname }: { hostname: string }) {
  return (
    <ReportLayout>
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ankora-text-muted">
          Audit interrompu
        </p>
        <h1 className="mt-4 font-display text-3xl sm:text-4xl font-bold text-ankora-text">
          Quelque chose s&apos;est mal passé pour {hostname}
        </h1>
      </div>

      <Card className="border-destructive/30">
        <CardContent className="pt-6 pb-6 space-y-4 text-center">
          <p className="text-base text-ankora-text-soft">
            L&apos;audit n&apos;a pas pu aboutir. C&apos;est rare et de notre
            côté — relancez-le ou écrivez-nous, on vous répond vite.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild variant="gradient" size="lg">
              <Link href="/">Réessayer un audit</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="mailto:contact@robinpailhes.fr">Nous contacter</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </ReportLayout>
  );
}

// ---------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------
export default async function AuditReportPage({
  params,
}: {
  params: { id: string };
}) {
  const report = await getReport(params.id);
  if (!report) notFound();

  // Routing par status
  if (report.status === "failed") {
    return <FailedReportView hostname={report.hostname} />;
  }

  // Statuts intermediaires : redirection automatique vers la page de
  // progression — c'est sa responsabilite d'attendre que l'audit
  // termine puis de revenir ici via auto-redirect.
  if (report.status !== "done") {
    redirect(`/audit/${params.id}/progress`);
  }

  // ---- Status === "done" : on rend le rapport ----
  return (
    <ReportLayout>
      {/* Bandeau warning localisation — visible UNIQUEMENT si scope=local
          mais sans city/region detectees. CTA pour relancer avec saisie. */}
      <LocationWarning
        scope={report.business_scope}
        city={report.city}
        region={report.region}
      />

      {/* Bloc 1 — Phrase business-first + score IA secondaire + sous-scores par IA */}
      <ScoreHero
        globalScore={report.global_score}
        perProvider={report.per_provider}
        mentionRate={report.mention_rate}
        businessScope={report.business_scope}
        cityMain={report.city_main}
      />

      {/* Bloc 2 — Verdict en 1 phrase */}
      <Verdict
        brandName={report.brand_name}
        globalScore={report.global_score}
        mentionRate={report.mention_rate}
        topCompetitor={report.top_competitor}
        totalQueries={report.total_queries}
        brandMentionsCount={report.brand_mentions_count}
      />

      {/* Bloc 3 — Manque à gagner (narrative ville + secteur + ratio
          aligne sur le score : on utilise your_mentions_count et
          score_base_responses_count, pas brand_mentions_count/120,
          pour eviter l'incoherence "Hero dit 5 vous trouvent /
          LostOpportunities dit 33 vous trouvent" qui apparaissait
          quand le bloc divisait par 120 (incluant les branded). */}
      <LostOpportunities
        globalScore={report.global_score}
        yourMentions={report.your_mentions_count}
        scoreBaseResponsesCount={report.score_base_responses_count}
        cityMain={report.city_main}
        city={report.city}
        industry={report.industry}
      />

      {/* Bloc 4 — Top 3 concurrents (podium + VOUS) */}
      <TopCompetitors
        competitors={report.top_competitors}
        brandName={report.brand_name}
        yourMentions={report.your_mentions_count}
        scoreBaseResponsesCount={report.score_base_responses_count}
        globalScore={report.global_score}
        cityMain={report.city_main}
        businessScope={report.business_scope}
        cityMainPlatformsAboveBrand={report.city_main_platforms_above_brand}
      />

      {/* Bloc 4.5 — Concurrents connus (uniquement si l'utilisateur en
          a saisi au formulaire). Matchup ciblé : pour chaque concurrent
          indiqué, on a posé aux 4 IA "Que pensez-vous de {C}" et
          "Alternatives à {C}", puis on mesure si la marque ressort
          dans ces réponses. C'est ce qui transforme l'audit générique
          en audit terrain. */}
      <KnownCompetitorsPanel
        matchups={report.known_competitors}
        brandName={report.brand_name}
      />

      {/* Bloc 5 — Aperçu en direct d'une réponse IA (le wow ultime) */}
      <AIResponsePreview
        samples={report.samples}
        brandName={report.brand_name}
        location={{
          scope: report.business_scope,
          city: report.city,
          city_main: report.city_main,
          region: report.region,
        }}
      />

      {/* Bloc 5.5 — Toutes les questions testées (collapsible, gratuit) */}
      <AllQueriesPanel
        queries={report.all_queries}
        brandName={report.brand_name}
        cityMain={report.city_main}
        city={report.city}
        region={report.region}
      />

      {/* Bloc 6 — Pourquoi vous êtes invisible (3 cards verticales) */}
      <WhyInvisible
        reasons={report.why_reasons}
        globalScore={report.global_score}
      />

      {/* Bloc 7 — Ce qu'il faut faire (3 actions prioritaires) */}
      <PriorityActions
        actions={report.recommendations.top3}
        totalCount={report.recommendations.total_count}
      />

      {/* Bloc 8 — Rappel d'urgence (ou de leadership selon score) */}
      <UrgencyReminder globalScore={report.global_score} />

      {/* Bloc 8.5 — Questions personnalisees (3 max, gratuit, isole du score) */}
      <ManualQueries
        auditId={report.audit_id}
        industry={report.industry}
        cityMain={report.city_main}
        city={report.city}
        brandName={report.brand_name}
        initial={
          (await getManualQueries(report.audit_id)) ?? {
            count: 0,
            remaining: 3,
            queries: [],
            pending: false,
          }
        }
      />

      {/* Bloc 8.7 — Evolution mesuree (presence par cat + delta vs precedent) */}
      <EvolutionPanel data={report.evolution} />

      {/* Bloc 9 — CTA principal (Calendly ou mailto fallback) */}
      <MainCta
        globalScore={report.global_score}
        brandName={report.brand_name}
        hostname={report.hostname}
      />

      {/* Bloc 11 — Capture email inline */}
      <EmailCapture auditId={report.audit_id} />

      {/* Bonus — Powered by Ankora */}
      <PoweredByAnkora />
    </ReportLayout>
  );
}

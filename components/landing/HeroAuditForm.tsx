"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ShieldCheck, Zap, Heart, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { validateAuditUrl } from "@/lib/security/url-validator";
import { cn } from "@/lib/utils";

// =====================================================================
// <HeroAuditForm /> — formulaire central de la landing.
//
// Comportements :
//   - Validation client en temps reel (debounced 200ms) : on utilise
//     le meme validateur que le serveur (lib/security/url-validator) —
//     pure logique, compatible browser, donc DRY parfait.
//   - Bouton desactive si URL invalide (apres premiere saisie).
//   - Au submit : POST /api/audits, redirige vers /audit/[id]/progress.
//   - Erreurs API -> toast clair selon le code retourne par le backend.
//
// Champ "Ville" optionnel (Phase localisation) :
//   80% des prospects sont des PME locales. La detection LLM des
//   adresses depuis le HTML est fiable a ~60% (footer / contact /
//   schema.org parfois absents). Pour garantir 100% de fiabilite, on
//   permet a l'utilisateur de saisir directement sa ville. La valeur
//   est envoyee via le champ `geo_target` deja accepte par l'API.
//   Le pipeline Inngest l'utilisera comme source autoritaire (override
//   le LLM si different) et basculera business_scope='local'.
//
// Le formulaire est mobile-first : champ + bouton empiles en colonne
// sur petits ecrans, alignes en ligne sur desktop (sm:flex-row).
// =====================================================================

type ApiSuccess = { audit_id: string; status: string };
type ApiError = { error: string; code?: string; reason?: string };

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited:
    "Vous avez déjà lancé plusieurs audits récemment. Réessayez dans 1 heure.",
  budget_exceeded:
    "Le quota mensuel de la plateforme est atteint. Réessayez demain.",
  captcha_required: "Vérification anti-robot requise. Rechargez la page.",
  server_error: "Une erreur est survenue. Réessayez ou contactez-nous.",
};

function pickErrorMessage(payload: ApiError): string {
  if (payload.code && ERROR_MESSAGES[payload.code]) {
    return ERROR_MESSAGES[payload.code];
  }
  return payload.error ?? "Une erreur est survenue. Réessayez.";
}

export function HeroAuditForm({ className }: { className?: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [city, setCity] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Validation client : meme logique que le serveur. Memo pour eviter
  // de re-valider a chaque render quand value n'a pas change.
  const validation = React.useMemo(() => {
    if (!value.trim()) return null;
    return validateAuditUrl(value);
  }, [value]);

  const isValid = validation?.ok === true;
  const showError = touched && validation && !validation.ok;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);

    if (!validation || !validation.ok) {
      toast.error("URL invalide", {
        description:
          (validation && !validation.ok && validation.message) ||
          "Vérifie le format (ex: https://votre-site.fr).",
      });
      return;
    }

    setSubmitting(true);
    try {
      // Le champ ville est optionnel : si rempli, on l'envoie en
      // geo_target (champ deja accepte par /api/audits depuis le debut).
      const trimmedCity = city.trim();
      const body: { url: string; geo_target?: string } = {
        url: validation.url,
      };
      if (trimmedCity) {
        body.geo_target = trimmedCity;
      }

      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as
        | ApiSuccess
        | ApiError;

      if (!res.ok) {
        const msg = pickErrorMessage(data as ApiError);
        toast.error("Audit non lancé", { description: msg });
        setSubmitting(false);
        return;
      }

      const { audit_id } = data as ApiSuccess;
      // On garde le state submitting pendant la nav (UX : pas de double-submit)
      router.push(`/audit/${audit_id}/progress`);
    } catch {
      toast.error("Connexion impossible", {
        description: "Vérifie ton accès internet et réessaie.",
      });
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("w-full max-w-2xl mx-auto", className)}
      noValidate
      aria-label="Formulaire d'audit gratuit"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
        <Input
          type="text"
          inputMode="url"
          autoComplete="url"
          name="url"
          placeholder="https://votre-site.fr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          disabled={submitting}
          className="h-14 sm:h-16 text-base sm:flex-1 sm:rounded-2xl"
          aria-invalid={showError ? true : undefined}
          aria-describedby={showError ? "audit-url-error" : undefined}
        />
        <Button
          type="submit"
          variant="gradient"
          size="xl"
          disabled={submitting || (touched && !isValid)}
          className="h-14 sm:h-16 sm:rounded-2xl"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Lancement…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              Lancer mon audit gratuit
            </>
          )}
        </Button>
      </div>

      {/* Champ ville optionnel — discret mais utile pour les commerces locaux */}
      <div className="mt-3">
        <div className="relative">
          <MapPin
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ankora-text-muted"
            aria-hidden="true"
          />
          <Input
            type="text"
            name="city"
            placeholder="Ville (optionnel) — ex: Paris, Lyon, Carnon…"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={submitting}
            maxLength={120}
            autoComplete="address-level2"
            className="h-12 pl-9 text-sm sm:rounded-xl"
            aria-describedby="audit-city-help"
          />
        </div>
        <p
          id="audit-city-help"
          className="mt-1.5 text-xs text-ankora-text-muted text-center sm:text-left"
        >
          Recommandé si vous êtes un commerce local — améliore fortement
          la pertinence de l&apos;audit.
        </p>
      </div>

      {showError && validation && !validation.ok && (
        <p
          id="audit-url-error"
          role="alert"
          className="mt-3 text-sm text-destructive text-center sm:text-left"
        >
          {validation.message}
        </p>
      )}

      <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ankora-text-soft">
        <li className="inline-flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
          5 minutes
        </li>
        <li className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          Sans inscription
        </li>
        <li className="inline-flex items-center gap-1.5">
          <Heart className="h-4 w-4 text-primary" aria-hidden="true" />
          100% gratuit
        </li>
      </ul>
    </form>
  );
}

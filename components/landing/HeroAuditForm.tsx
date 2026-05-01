"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ShieldCheck, Zap, Heart } from "lucide-react";

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
// Le formulaire est mobile-first : champ + bouton empiles en colonne
// sur petits ecrans, alignes en ligne sur desktop (sm:flex-row).
// =====================================================================

type ApiSuccess = { audit_id: string; status: string };
type ApiError = { error: string; code?: string; reason?: string };

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited:
    "Vous avez deja lance plusieurs audits recemment. Reessayez dans 1 heure.",
  budget_exceeded:
    "Le quota mensuel de la plateforme est atteint. Reessayez demain.",
  captcha_required: "Verification anti-robot requise. Rechargez la page.",
  server_error: "Une erreur est survenue. Reessayez ou contactez-nous.",
};

function pickErrorMessage(payload: ApiError): string {
  if (payload.code && ERROR_MESSAGES[payload.code]) {
    return ERROR_MESSAGES[payload.code];
  }
  return payload.error ?? "Une erreur est survenue. Reessayez.";
}

export function HeroAuditForm({ className }: { className?: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
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
          "Verifie le format (ex: https://votre-site.fr).",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: validation.url }),
      });

      const data = (await res.json().catch(() => ({}))) as
        | ApiSuccess
        | ApiError;

      if (!res.ok) {
        const msg = pickErrorMessage(data as ApiError);
        toast.error("Audit non lance", { description: msg });
        setSubmitting(false);
        return;
      }

      const { audit_id } = data as ApiSuccess;
      // On garde le state submitting pendant la nav (UX : pas de double-submit)
      router.push(`/audit/${audit_id}/progress`);
    } catch {
      toast.error("Connexion impossible", {
        description: "Verifie ton acces internet et reessaie.",
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
              Lancement...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              Lancer mon audit gratuit
            </>
          )}
        </Button>
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

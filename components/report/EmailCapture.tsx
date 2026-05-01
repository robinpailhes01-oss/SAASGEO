"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";

// =====================================================================
// <EmailCapture /> — bloc 11 : capture email inline en bas de rapport.
//
// Form HTML basique avec validation email cote client (regex souple),
// POST sur /api/email-captures avec { email, audit_id, source }.
// L'envoi reel d'email viendra en Phase E (Resend).
//
// Design discret : Card secondary/30, input + bouton alignes
// horizontalement sur desktop, empiles sur mobile (flex-col sm:flex-row).
// Toast Sonner sur succes/erreur. Apres succes, on remplace le form
// par un message de confirmation (pas de double-submit).
// =====================================================================

type EmailCaptureProps = {
  auditId: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailCapture({ auditId }: EmailCaptureProps) {
  const reduce = useReducedMotion();
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Adresse email invalide.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/email-captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          audit_id: auditId,
          source: "report_inline",
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok) {
        const message =
          data?.error ?? "Une erreur est survenue, réessayez dans un instant.";
        setError(message);
        toast.error(message);
        return;
      }
      setDone(true);
      toast.success("Rapport envoyé sur votre email !");
    } catch {
      const message = "Connexion impossible, réessayez dans un instant.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -100px 0px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      aria-labelledby="email-capture-title"
    >
      <Card className="border-ankora-border bg-secondary/30">
        <CardContent className="pt-6 pb-6 px-6 sm:px-8">
          <div className="flex items-start gap-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <Mail className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <h3
                id="email-capture-title"
                className="font-display text-lg sm:text-xl font-semibold text-ankora-text"
              >
                Recevez ce rapport par email
              </h3>
              <p className="mt-1 text-sm text-ankora-text-soft">
                On vous envoie le lien de cette page et un récapitulatif
                pour le partager facilement.
              </p>

              {done ? (
                <div className="mt-4 flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  <span className="text-base font-medium">
                    Merci, on s&apos;occupe de l&apos;envoi !
                  </span>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="mt-4 flex flex-col sm:flex-row gap-2 sm:gap-3"
                  noValidate
                >
                  <div className="flex-1">
                    <Label htmlFor="email-capture-input" className="sr-only">
                      Adresse email
                    </Label>
                    <Input
                      id="email-capture-input"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="vous@domaine.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      disabled={submitting}
                      aria-invalid={error ? "true" : undefined}
                      aria-describedby={
                        error ? "email-capture-error" : undefined
                      }
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="default"
                    disabled={submitting}
                    className="sm:w-auto"
                  >
                    {submitting ? (
                      <>
                        <Loader2
                          className="mr-2 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Envoi…
                      </>
                    ) : (
                      "Envoyer"
                    )}
                  </Button>
                </form>
              )}

              {error ? (
                <p
                  id="email-capture-error"
                  role="alert"
                  className="mt-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}

              <p className="mt-3 text-xs text-ankora-text-muted">
                Aucun spam, désinscription en 1 clic.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.section>
  );
}

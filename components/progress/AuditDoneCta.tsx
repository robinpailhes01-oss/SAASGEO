"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// =====================================================================
// <AuditDoneCta /> — état terminal "Votre rapport est prêt".
//
// - Animation d'entrée enthousiaste (scale + fade)
// - Compteur de redirection visible (3 s)
// - Bouton gradient large vers /audit/[id]
// - Si l'utilisateur clique avant la fin du compteur, redirect immédiat
// =====================================================================

type AuditDoneCtaProps = {
  auditId: string;
  // Combien de secondes avant l'auto-redirect (0 = désactivé)
  autoRedirectSec?: number;
};

export function AuditDoneCta({ auditId, autoRedirectSec = 3 }: AuditDoneCtaProps) {
  const router = useRouter();
  const reportUrl = `/audit/${auditId}`;
  const [remaining, setRemaining] = React.useState(autoRedirectSec);

  React.useEffect(() => {
    if (autoRedirectSec <= 0) return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          router.push(reportUrl);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [autoRedirectSec, reportUrl, router]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <Card className="border-ankora-border shadow-ankora-elevated">
        <CardContent className="pt-9 pb-8 text-center">
          <div
            className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-ankora-gradient text-white shadow-[0_0_28px_rgba(167,139,250,0.55)]"
            aria-hidden="true"
          >
            <Sparkles className="h-7 w-7" />
          </div>

          <h2 className="mt-5 font-display text-2xl sm:text-3xl font-bold text-ankora-text">
            Votre rapport est prêt
          </h2>
          <p className="mt-2 text-base text-ankora-text-soft">
            On a fini. Découvrez ce que les IA disent vraiment de vous.
          </p>

          <div className="mt-7 flex flex-col items-center gap-3">
            <Button
              variant="gradient"
              size="xl"
              onClick={() => router.push(reportUrl)}
              className="w-full max-w-xs"
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              Voir mon rapport
            </Button>
            {autoRedirectSec > 0 && remaining > 0 && (
              <p
                className="text-xs text-ankora-text-muted"
                aria-live="polite"
              >
                Redirection automatique dans {remaining}…
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

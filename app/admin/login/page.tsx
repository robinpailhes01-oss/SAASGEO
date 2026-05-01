// =====================================================================
// Page /admin/login
//
// Page minimaliste : un seul champ mot de passe + Server Action.
// Le layout parent (app/admin/layout.tsx) fournit deja le header.
// On centre le formulaire sur la hauteur disponible.
// =====================================================================

import type { Metadata } from "next";

import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { loginAction } from "./actions";

export const metadata: Metadata = {
  title: "Connexion admin — Ankora",
  robots: { index: false, follow: false },
};

type SearchParams = {
  error?: string;
  next?: string;
};

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const hasError = searchParams.error === "1";
  const next = searchParams.next ?? "/admin";

  return (
    <Container size="prose" className="py-16 sm:py-24">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Espace admin</CardTitle>
          <CardDescription>
            Accès réservé. Saisis le mot de passe pour continuer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />

            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                name="password"
                required
                autoFocus
                autoComplete="current-password"
              />
            </div>

            {hasError && (
              <p
                className="text-sm text-destructive"
                role="alert"
                aria-live="polite"
              >
                Mot de passe incorrect.
              </p>
            )}

            <Button type="submit" className="w-full" size="lg">
              Se connecter
            </Button>
          </form>
        </CardContent>
      </Card>
    </Container>
  );
}

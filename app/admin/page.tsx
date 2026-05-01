// =====================================================================
// /admin — placeholder de tableau de bord.
//
// La vraie page (liste audits + emails captures + stats du mois) sera
// implementee en Phase D / E. Pour l'instant on affiche juste un etat
// "en construction" pour valider l'auth et la coherence visuelle.
//
// Meta noindex stricte : meme si la zone est protegee, on s'assure
// qu'aucun crawler n'indexe ces routes en cas de fuite de lien.
// =====================================================================

import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/layout/Container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Admin — Ankora",
  robots: { index: false, follow: false },
};

export default function AdminHomePage() {
  return (
    <Container className="py-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold text-ankora-text">
            Tableau de bord
          </h1>
          <Badge variant="warning">En construction</Badge>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/logout">Se déconnecter</Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Audits du mois</CardTitle>
            <CardDescription>
              Compteur sur les 30 derniers jours
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold text-ankora-text">
              &mdash;
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads capturés</CardTitle>
            <CardDescription>
              Adresses récoltées sur les rapports
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold text-ankora-text">
              &mdash;
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget API</CardTitle>
            <CardDescription>
              Consommé / cap mensuel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold text-ankora-text">
              &mdash;
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="mt-10 text-sm text-ankora-text-muted">
        Le tableau de bord complet (liste audits + emails + stats) sera livré en Phase D / E.
      </p>
    </Container>
  );
}

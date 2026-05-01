// =====================================================================
// Layout admin — shell minimal autour des pages /admin/*
//
// Le middleware (cf. middleware.ts) garantit l'auth sur tout /admin
// sauf /admin/login et /admin/logout. Ce layout enveloppe TOUS les
// enfants — y compris la page login — avec un header sobre qui
// contient le logo, un badge "Admin" et un lien "Voir le site".
//
// Pas de bouton "Se deconnecter" ici : un lien vers /admin/logout est
// prevu dans la page tableau de bord (la ou l'utilisateur termine ses
// actions). Garder le header pur reduit le bruit visuel.
// =====================================================================

import Link from "next/link";

import { Logo } from "@/components/layout/Logo";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-ankora-border bg-white">
        <Container>
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo size="sm" />
              <Badge variant="primary" className="hidden sm:inline-flex">
                Admin
              </Badge>
            </div>

            <Button asChild variant="ghost" size="sm">
              <Link href="/" target="_blank" rel="noopener">
                Voir le site
              </Link>
            </Button>
          </div>
        </Container>
      </header>

      <main>{children}</main>
    </div>
  );
}

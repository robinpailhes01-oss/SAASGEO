import * as React from "react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/layout/Container";

// =====================================================================
// <ReportLayout /> — shell visuel des pages /audit/[id].
//
// Header public (variant minimal pour ne pas perturber l'attention),
// container narrow (880px) pour preserver la lisibilite sur grand
// ecran, footer standard.
// =====================================================================

type ReportLayoutProps = {
  children: React.ReactNode;
};

export function ReportLayout({ children }: ReportLayoutProps) {
  return (
    <>
      <Header variant="minimal" />
      <main className="py-12 sm:py-16">
        <Container size="narrow" className="space-y-12 sm:space-y-16">
          {children}
        </Container>
      </main>
      <Footer />
    </>
  );
}

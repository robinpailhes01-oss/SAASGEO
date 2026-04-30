import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

// Typographies validees phase 0
// - Inter : corps de texte (Google Fonts)
// - Geist : titres et display (package "geist" officiel Vercel)
// - JetBrains Mono : chiffres KPI et code (Google Fonts)
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ankora — Ancrez votre marque dans les IA",
  description:
    "Audit GEO complet et tracking de visibilite dans les IA conversationnelles (ChatGPT, Claude, Perplexity, Gemini). Specialise tourisme et hotellerie.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${GeistSans.variable} ${jetbrains.variable}`}
    >
      <body className="font-sans antialiased min-h-screen bg-background">
        {children}
      </body>
    </html>
  );
}

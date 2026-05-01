// =====================================================================
// Page /admin/login
//
// Page minimaliste : un seul champ mot de passe + Server Action.
// Le design final viendra avec Phase A.4 (shadcn/ui + design system).
// Ici on se contente d'une UI fonctionnelle, sobre et accessible.
// =====================================================================

import type { Metadata } from "next";
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
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">
          Espace admin
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Acces reserve. Saisis le mot de passe pour continuer.
        </p>

        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Mot de passe
            </span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </label>

          {hasError && (
            <p
              className="text-sm text-red-600"
              role="alert"
              aria-live="polite"
            >
              Mot de passe incorrect.
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 transition-colors"
          >
            Se connecter
          </button>
        </form>
      </div>
    </main>
  );
}

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";

// Client Supabase cote serveur (Server Components, Server Actions, API routes)
// Utilise la cle anon — RLS protege les donnees, les cookies portent la session.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component context — set ignore est attendu
          }
        },
      },
    }
  );
}

// Client Supabase admin (bypass RLS) — usage SERVEUR UNIQUEMENT
// A utiliser dans les fonctions Inngest, scripts d'admin, et la couche
// API ou on gere des operations qui doivent contourner les RLS.
// JAMAIS exposer la SERVICE_ROLE_KEY au client.
//
// Utilise @supabase/supabase-js directement (et pas @supabase/ssr) car
// l'inference de types de from() est meilleure avec le client de base.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

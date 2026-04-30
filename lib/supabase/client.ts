import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

// Client Supabase cote browser (Client Components)
// Utilise la cle anon (publique) — RLS protege les donnees
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

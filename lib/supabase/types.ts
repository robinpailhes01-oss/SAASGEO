// Types TypeScript de la base Supabase
// Sera regenere automatiquement apres application des migrations via :
//   pnpm dlx supabase gen types typescript --project-id bgdhaajvythiyzkekrui > lib/supabase/types.ts
// (a lancer manuellement apres chaque changement de schema)
//
// Pour l'instant, on declare un type vide compatible — sera remplace
// au moment ou on lancera la generation auto en fin de Bloc 1.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

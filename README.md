# Ankora

> Ancrez votre marque dans les IA conversationnelles.

Ankora est un outil d'audit GEO (Generative Engine Optimization) et de tracking de visibilite dans les IA conversationnelles (ChatGPT, Claude, Perplexity, Gemini), specialise tourisme et hotellerie.

L'app combine deux dimensions :

1. **Audit technique GEO** — analyse du site sur 5 categories (fondations, triptyque GEO, structured data, contenu, autorite externe), score sur 100.
2. **AI Visibility Tracking** — interrogation parallele des 4 grandes IA avec 30 requetes-cibles generees automatiquement, mesure de la visibilite reelle de la marque.

Score global pondere : `0.4 x technique + 0.6 x visibility`.

---

## Stack

- **Front** : Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui + Framer Motion
- **Back** : API routes Next.js + Supabase (Postgres + Auth + Storage)
- **Orchestration** : Inngest (queues durables, retries, fan-out)
- **Scraping** : `fetch` + Jina Reader (free) + Browserless (fallback payant)
- **APIs IA** : OpenAI, Anthropic, Perplexity, Gemini
- **PDF** : Puppeteer + page Next.js dediee `/report/[id]/print`
- **Deploy** : Vercel (front) + Supabase EU Frankfurt (back)

---

## Setup local

### 1. Prerequis

- Node 20+ (teste avec 22)
- pnpm 10+
- Compte Supabase actif avec projet en region EU Frankfurt
- Compte Vercel (pour le deploy)

### 2. Installation

```bash
git clone https://github.com/robinpailhes01-oss/saasgeo.git ankora
cd ankora
git checkout claude/geo-audit-app-Ia07Z
pnpm install
```

### 3. Variables d'environnement

```bash
cp .env.example .env.local
```

Remplis les variables dans `.env.local`. Au minimum pour Bloc 1 :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Les autres cles (LLMs, Inngest, Resend) seront ajoutees aux Blocs 3 et 4.

### 4. Application des migrations Supabase

Les migrations sont dans `supabase/migrations/`. Deux options :

**Option A — via le MCP Supabase (recommandee en developpement Ankora)**
Les migrations sont appliquees automatiquement lors du setup initial via Claude Code.

**Option B — via la CLI Supabase**
```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref bgdhaajvythiyzkekrui
pnpm dlx supabase db push
```

### 5. Generation des types TypeScript

Apres chaque modification du schema, regenere les types :

```bash
pnpm dlx supabase gen types typescript \
  --project-id bgdhaajvythiyzkekrui \
  > lib/supabase/types.ts
```

### 6. Lancement dev

```bash
pnpm dev
```

L'app tourne sur `http://localhost:3000`.

---

## Variables d'environnement attendues

Voir `.env.example` pour la liste complete documentee. Resume :

| Variable | Bloc | Obligatoire | Note |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 1 | Oui | Region EU Frankfurt |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 1 | Oui | Cle publique |
| `SUPABASE_SERVICE_ROLE_KEY` | 1 | Oui | **Sensible — server only** |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` / `NEXTAUTH_SECRET` | 1 | Oui | Auth admin V0 |
| `OPENAI_API_KEY` | 3 | Oui | Cap budget 30 EUR/mois |
| `ANTHROPIC_API_KEY` | 3 | Oui | Cap budget 30 EUR/mois |
| `PERPLEXITY_API_KEY` | 3 | Oui | Cap budget 20 EUR/mois |
| `GEMINI_API_KEY` | 3 | Oui | Free tier genereux |
| `JINA_API_KEY` | 2 | Non | Public endpoint OK sans cle |
| `BROWSERLESS_TOKEN` | 2 | Non | Free tier 1k units suffit |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | 4 | Oui | Free tier 50k exec/mois |
| `RESEND_API_KEY` | 4 | Oui | Alertes budget |
| `MONTHLY_API_BUDGET_EUR` | 1 | Oui | Cap dur 90 EUR |
| `MONTHLY_AUDIT_CAP` | 1 | Oui | Cap dur 75 audits |

---

## Convention Git

### Branche de developpement

Toutes les modifications passent par : `claude/geo-audit-app-Ia07Z`

### Format de message de commit (francais)

```
type(bloc-X): description courte
```

- `type` : `feat`, `fix`, `refactor`, `docs`, `chore`, `style`, `test`
- `bloc-X` : numero du bloc Phase 1 (1 a 6)

Exemples :
- `feat(bloc-1): setup initial Next.js + Supabase + shadcn`
- `feat(bloc-2): module fetcher avec fallback Jina`
- `fix(bloc-3): correction detection mention sur marques composees`

### Commits = jalons

Un commit par bloc termine. Pas de commits granulaires intermediaires en developpement Ankora — historique propre et reviewable.

---

## Roadmap Phase 1

| Bloc | Contenu | Jours |
|---|---|---|
| 1 | Setup initial (Next.js, Supabase, schema DB) | 1 |
| 2 | Core scraping + audit technique 5 categories | 2-4 |
| 3 | Pipeline IA : 4 providers + extraction + detection mention | 5-7 |
| 4 | Orchestration Inngest + realtime progress | 8-9 |
| 5 | UI rapport minimum viable (data-first) | 10-12 |
| 6 | Tests E2E + premier audit reel (Harmonie Yacht) | 13-15 |

Validation utilisateur requise entre chaque bloc.

---

## Securite & RGPD

- Hosting EU Frankfurt (Supabase region eu-central-1)
- Aucune donnee personnelle stockee hors profil utilisateur
- Service role key jamais exposee cote client
- RLS active sur toutes les tables
- Caps budget durs en code pour eviter les derapages financiers

---

## Licence

Projet prive. Tous droits reserves.

---

## Contact

Robin Pailhes — consultant AI/GEO specialise tourisme et hotellerie.

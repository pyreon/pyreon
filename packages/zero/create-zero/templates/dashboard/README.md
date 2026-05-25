# {{name}}

A [Pyreon Zero](https://pyreon.dev/docs/zero) SaaS dashboard starter — marketing landing → auth-gated `/app/*` routes → invoice PDF/email export via `@pyreon/document-primitives`.

## Getting started

```bash
bun install
bun run dev          # → http://localhost:3000
```

## What's in this project

### Public marketing surface

- **`src/routes/_layout.tsx`** — marketing chrome (`MarketingHeader`)
- **`src/routes/index.tsx`** — landing page
- **`src/routes/login.tsx`** + **`src/routes/signup.tsx`** — auth pages
- **`src/routes/pricing.tsx`** — pricing tiers

### Auth-gated dashboard

- **`src/routes/app/_layout.tsx`** — sidebar shell (overview + users + invoices + settings)
- **`src/routes/app/index.tsx`** — overview dashboard
- **`src/routes/app/users/`** — user management (list + detail + edit)
- **`src/routes/app/invoices/`** — invoice list
- **`src/routes/app/invoices/[id].tsx`** — invoice detail with **PDF + email export** via `@pyreon/document-primitives` (the same component tree renders in browser AND exports to many formats — Pyreon's headline angle)
- **`src/routes/app/settings.tsx`** — workspace settings

### Data + auth layer

- **`src/lib/auth.ts`** — auth surface (in-memory stub OR Supabase if you selected the integration)
- **`src/lib/db.ts`** — data layer (in-memory stub OR Supabase)
- **`src/middleware/auth.ts`** — route guard for `/app/*`

If you scaffolded with `--integrations supabase`, the `auth.ts` + `db.ts` stubs are replaced with real Supabase wiring + `src/lib/supabase.ts`.

If you scaffolded with `--integrations email`, you also get `src/lib/email.ts` (Resend), `src/emails/welcome.tsx` (a document-primitives email template), and `src/routes/api/email/welcome.ts`.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Dev server with signal-preserving HMR |
| `bun run build` | Build for production (client + server bundles) |
| `bun run preview` | Serve the production build locally |
| `bun run doctor` | Audit the project (lint + types + perf budgets) |
| `bun run lint` | Run `@pyreon/lint` (Pyreon-specific rules) |

## Env variables

If you scaffolded an integration, see **`.env.example`** for the required keys (`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `RESEND_API_KEY` / `EMAIL_FROM`). Copy to `.env.local`:

```bash
cp .env.example .env.local
# then fill in the real values
```

## Deploying

This project was scaffolded with a deployment adapter — see the platform-specific artefacts (`vercel.json` / `wrangler.toml` / `netlify.toml` / `Dockerfile`) at the project root.

The dashboard template requires a server runtime (auth + db are server-mediated) — `static` adapter is intentionally excluded.

## Learn more

- **Docs** — https://pyreon.dev/docs
- **Zero meta-framework** — https://pyreon.dev/docs/zero
- **`@pyreon/document-primitives`** — https://pyreon.dev/docs/document-primitives (one component tree, many output formats)
- **Authentication patterns** — https://pyreon.dev/docs/router#guards
- **The 67+ UI components** — https://pyreon.dev/docs/ui-components

Found a bug or have a question? https://github.com/pyreon/pyreon/issues

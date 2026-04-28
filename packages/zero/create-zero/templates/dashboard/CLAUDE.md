# Dashboard (Pyreon Zero)

A SaaS-shape application starter. Marketing site at `/`, auth-gated app under `/app/*`, with a built-in invoice export demo using `@pyreon/document-primitives` — the same component tree renders in the browser AND exports to PDF/email.

## Reactivity (Pyreon, not React)

- `signal()` not `useState`; `computed()` not `useMemo`; `effect()` not `useEffect`.
- Write signals via `signal.set(value)` or `signal.update(fn)`.
- In JSX, signals auto-call: `{count}` (compiler inserts `()`).

## JSX

- `class=` not `className`; `for=` not `htmlFor`; camelCase events.

## Auth + DB

`src/lib/auth.ts` and `src/lib/db.ts` hold the auth + data layer. They
ship with **in-memory implementations** so the dashboard runs out of the
box on a fresh clone — every dev-server restart wipes the data.

To wire a real backend, run:

```bash
bunx create-pyreon-app --template dashboard --integrations supabase,email
```

The scaffolder overwrites `auth.ts` + `db.ts` with Supabase-backed
implementations and writes `src/lib/email.ts` + `src/emails/welcome.tsx`
for Resend. The exported function signatures stay identical, so no route
files need to change. On an existing project, you can run the same
scaffolder flags or hand-edit the two files — the surface is small.

## Routes

- `/` — marketing landing
- `/login`, `/signup` — auth forms
- `/app/dashboard` — overview cards
- `/app/users` — table view of users
- `/app/invoices` — invoice list
- `/app/invoices/:id` — invoice detail with **"Export to PDF" / "Send email"** buttons (the headline demo)
- `/app/settings/*` — account / profile / billing settings

## Commands

```bash
bun run dev       # dev server
bun run build     # production build
bun run preview   # serve build
bun run doctor    # check for React patterns
```

---
'@pyreon/zero-cli': patch
'@pyreon/create-zero': patch
---

fix(zero-cli): `zero preview` now serves built output (no more HTTP 404 on the homepage)

`zero build` writes the client bundle to `dist/client/` (see [packages/zero/cli/src/commands/build.ts](packages/zero/cli/src/commands/build.ts)), but `zero preview` was wrapping `vite preview` with no `outDir` override — so vite served from `dist/` (which only contains the `client/`, `server/`, `output/` subdirectories). Every scaffolded SSR / SSG / SPA project returned HTTP 404 from `bun run preview` on the homepage. The build artefact was correct; the preview command just looked in the wrong place.

`zero preview` now detects `dist/client/` and passes it as `build.outDir` to vite preview. The 30 prior published `@pyreon/zero-cli` releases all had this bug; this lands as part of the next 0.x.

**DX improvements bundled in `@pyreon/create-zero`:**

- Every template (`app`, `blog`, `dashboard`) now ships a `README.md` with project-name substitution, getting-started commands, per-template "what's in this project" section, scripts table, deploy notes, and doc links. Previously only the `monorepo` template had a README — the flat templates landed with no documentation at the project root.

- `scripts/scaffold-smoke.ts` gained a `previewSmoke?:` hook that spawns `bun run preview` against the built output, waits for the local URL, fetches the homepage, and asserts HTTP 200 + non-empty HTML body. Wired into 3 representative cells (app+vercel, blog+cloudflare, dashboard+vercel+full integrations). Bisect-verified: reverting the `zero preview` fix fails `cpa-smoke-app-vercel` with `preview HTTP 404 from http://localhost:NNNN (expected 200)`; restored → passes.

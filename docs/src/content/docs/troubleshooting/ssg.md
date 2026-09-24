---
title: "SSG / e2e Test-Server Mistakes"
description: "Common ssg / e2e test-server mistakes in Pyreon and how to fix them."
---

# SSG / e2e Test-Server Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### `vite preview` for SSG e2e gates that read per-route HTML

`vite preview` serves `dist/index.html` for any URL without a literal file, so `/cs/posts` returns the home page and tests report phantom framework bugs (missing loader data, missing meta). Use `scripts/serve-ssg.ts`, which rewrites `/cs/posts` → `dist/cs/posts/index.html` like real static hosts. Webserver shape: `bun run --filter=… build && bun scripts/serve-ssg.ts <dist> <port>` (see `e2e-configs/ssg-i18n.config.ts`). The `ssg-subpath` gate is exempt; it only checks link and asset prefixes.

---

### `immutable` cache keyed on file extension

`Cache-Control: public, max-age=31536000, immutable` is safe only for content-hashed files, which Vite emits under `<base><build.assetsDir>` (default `/assets/`). Keying on `.js`/`.css` makes a non-hashed root file such as `public/sw.js` unevictable. Adapters mark immutable only under the asset prefix (`assetUrlPrefix` in `packages/zero/zero/src/adapters/cache-headers.ts`); `*.html` gets `max-age=0, must-revalidate`; everything else a short revalidatable default. Reference: `packages/zero/zero/src/adapters/{node,bun}.ts`; locked by the spawn-and-curl specs in `adapters.test.ts` (`/assets/*.js` immutable, `/sw.js` not).

---

### ISR cacheability that checks only response signals

A loader that reads the request's `Cookie`/`Authorization` can return a plain `200` with no `Set-Cookie`/`Vary`, and a URL-keyed shared cache then serves one user's page to the next visitor. `isCacheable(res, req)` in `packages/zero/zero/src/isr.ts` refuses to cache a credentialed request under the default or `'path-only'` key unless the response sends whole-token `Cache-Control: public`; an explicit `cacheKey` function opts out. The revalidate path passes the original request too, so a credentialed background re-render cannot overwrite a public entry. The refusal warning fires once per handler in production as well. Locked by `packages/zero/zero/src/tests/isr.test.ts` (request-credential fail-safe specs).

---

### Comparing origins by prefix, trusting the first `X-Forwarded-For` entry

Both treat an attacker-shaped string as structured truth.
  - Origin: `startsWith(reqUrl.origin)` accepts `https://app.example.com.evil.net`, `…comevil.net` and `…com@evil.net`. Parse (`new URL(h).origin`, failure → `null` → reject) and compare with `===` / `includes()`. Parsing also normalizes default ports and reduces a `Referer` to its origin.
  - Forwarded chain: the head of `X-Forwarded-For` is the client's claim; rotating it bypasses a rate limiter and prepending a victim's IP spends the victim's bucket. Trust runs right to left. The deployment declares it via `trustProxy?: boolean | number` (default `false`: forwarded headers, including `X-Real-IP`, are not read; falls back to the transport peer or one shared bucket with a warning). A chain shorter than the declared hop count is discarded, not clamped.
  - Error bodies: return a generic message in production, detail only outside it, and log the real error either way.
  - Reference: `packages/zero/zero/src/actions.ts:originOf`, `rate-limit.ts:makeDefaultKeyFn`; locks `tests/actions.test.ts`, `tests/rate-limit.test.ts`.

---

### `cp(src, dest)` with `dest` equal to or inside `src`

Node's `fs.cp` throws `ERR_FS_CP_EINVAL`. zero's SSR plugin passes `clientOutDir === outDir === distDir` with the server bundle at `distDir/server`, and it catches adapter throws, so the failure was silent and no deploy artifact was staged. All adapters stage through `materialize(src, dest, { preserve })` (`packages/zero/zero/src/adapters/stage.ts`): same dir → no-op; dest inside src → copy top-level entries individually; disjoint → whole-dir copy. Adapter tests must use the same-dir shape production passes. Locks: `tests/{stage,adapters}.test.ts` (same-dir block).

---

### Production SSR shipping the dev client entry

`createHandler` defaults to `clientEntry: '/src/entry-client.ts'` and `DEFAULT_TEMPLATE`, which 404 in production and never hydrate. The SSR build copies the built client `index.html` to `dist/server/template.html`; `createServer` reads it (`readBuiltTemplate` in `packages/zero/zero/src/entry-server.ts`) and passes `clientEntry: false` (`packages/core/server/src/handler.ts`). Verify hydration by running the emitted server in a real browser (`ssr-node` e2e runs `node dist/index.js`), not by reading SSR HTML.

---

### Silent SSG path collisions

Two routes resolving to one URL used to be deduped silently. `detectPathCollisions` runs after `resolvePaths` and the build throws `[Pyreon] SSG path collision — …` listing each collision (`packages/zero/zero/src/ssg-plugin.ts`, with `formatPathCollisionError`). Any aggregation that can produce duplicates must fail loudly or report what it dropped.

---

### Vite-plugin source changes invisible to running dev server

Vite's config bundler resolves `@pyreon/zero` and `@pyreon/vite-plugin` through the `node` condition (`lib/`), while user runtime code loads from `src/`. After editing or reverting plugin source, run `bun run --filter='@pyreon/<package>' build` and restart the dev server before re-running Playwright. See `.agents/rules/testing.md` "Dev-server bisect".

---

### Non-atomic writes of manifests read as a set

`_redirects`, `_redirects.json`, `_pyreon-revalidate.json` are read together by deploy adapters, so an interrupted build must not leave a mix. Write to `<target>.tmp.<pid>.<seq>` and `rename` (best-effort unlink of the temp on failure) via `writeFileAtomic` (`packages/zero/zero/src/ssr-build-shared.ts`). Per-page HTML does not need it.

---

### Bare `JSON.stringify(loaderData)` for SSR data embedding

It throws an opaque error on cycles and silently drops functions. All embed sites use `stringifyLoaderData` from `@pyreon/router` (`packages/core/router/src/loader.ts`), which detects cycles and throws `[Pyreon] Loader returned circular reference at "<route-path>"…`, and strips functions/symbols (including array slots). A boundary that serializes user data owns the serialization and its error message.

---

### Dev-only warnings for missing adapter env vars

`vercelAdapter.revalidate(path)` runs in production webhook handlers, so a warning gated on `NODE_ENV !== 'production'` never reaches the operator and `regenerated: false` returns silently. Warnings about missing required config fire in every environment, deduped per process by a module-level Set. Reference: `packages/zero/zero/src/adapters/warn-missing-env.ts`.

---

### A security-sensitive convention left to hand-written code

Ship a scaffold instead. `vercelRevalidateHandler` (`packages/zero/zero/src/vercel-revalidate-handler.ts`) implements `/api/_pyreon-revalidate`: POST only, secret check (missing env var → 500, not 200), path validated against the revalidate manifest (unknown → 404) so a leaked token cannot revalidate arbitrary URLs.

---

### Dynamic routes silently skipped under `mode: 'ssg'` without `getStaticPaths`

Without an enumerator, `[id].tsx` produces no `dist/` file and production 404s. Caught by `pyreon/missing-get-static-paths` (warn, scoped to `src/routes/`) and `pyreon doctor --check-ssg`. The audit exempts a route declaring any non-`'ssg'` `export const renderMode` (`renderModeOverride` in `packages/core/compiler/src/ssg-audit.ts`); inside `mode: 'ssg'` only `'spa'` is valid, since `'ssr'`/`'isr'` are a build error (`assertModesSupported`). For a dynamic `'spa'` route the SSG build emits `dist/404.html` as the CSR shell (unless `_404.tsx` already wrote one; gated by `ssg.emit404`), so direct links work on static hosts. Locks: `tests/ssg-audit.test.ts`, `ssg-plugin.test.ts`.

---

### `export const revalidate = TTL` (non-literal) dropped from the ISR manifest

`extractLiteralExport` captures only a numeric literal or `false`; identifiers, arithmetic and calls are dropped and adapter `revalidate()` returns `regenerated: false`. Inline the literal (`export const revalidate = 60`). Caught by `pyreon/revalidate-not-pure-literal` (error) and `pyreon doctor --check-ssg`.

---

### `export const loader = <non-callable>`

`loader = { data: 1 }` or `loader = await fetch(...)` crashes SSR with `loader is not a function` from deep inside `prefetchLoaderData`. `pyreon/invalid-loader-export` (error) rejects object/array/string/number literals and accepts functions, identifiers, calls, member expressions and TS casts.

---

### Lint rules scoped by filename alone

Filename conventions collide. `pyreon/missing-get-static-paths` and `detectDynamicRouteMissingGetStaticPaths` skip files under `src/routes/api/` and files with no `export default` (API routes are never prerendered). Scope convention detectors by path and a structural signal, and run new rules against a real example app, not only synthetic fixtures.

---

### Per-call-site handling of a config enum

Open-coding one branch at each site silently ignores the others, and `audit-types` cannot see it because the type is referenced. `imagePlugin` routes every path (CDN, dev, build) through `generatePlaceholder(input, strategy, size)`; `normalizePlaceholder` maps the deprecated `'dominant-color'` to `'color'` at the config boundary. Reference: `packages/zero/zero/src/image-plugin.ts`.

---

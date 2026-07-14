---
"@pyreon/server": minor
"@pyreon/head": minor
"@pyreon/zero": patch
---

feat(server,head): thread the per-request CSP nonce onto every SSR-emitted inline tag

`cspMiddleware` + `useNonce` generated a per-request nonce and put it in the CSP header, but the nonce never reached the inline tags the SSR pipeline emits — so a strict nonce-based CSP (`script-src`/`style-src 'nonce-…'`, no `'unsafe-inline'`) blocked the loader-data hydration script (→ `useLoaderData()` undefined after hydration) and every CSS-in-JS `<style>` (→ unstyled page). The header promised CSP support the render didn't deliver.

Now the nonce threads end-to-end from the single string-mode choke point:

- **`renderPage`** reads `useRequestLocals().cspNonce` once (already inside the request context) and stamps it on the loader-data + store-state inline `<script>`s, forwards it to `collectStyles(nonce)` (styler `<style>`), and passes `renderWithHead(app, { nonce })` (head-injected `<script>`/`<style>`).
- **`@pyreon/head`**: `renderWithHead(app, { nonce })` / `serializeHead(tags, titleTemplate, nonce)` stamp the nonce on inline `<script>`/`<style>` tags (a user-supplied `nonce` on a tag wins; `<meta>`/`<link>` are never nonced). Wires the previously-declared-but-dead `HeadContext.nonce` intent.
- **`collectStyles`** signature widened to `(nonce?: string) => string` (backward-compatible optional param); zero's SSG styler wiring forwards it.

Lower packages stay decoupled — they *accept* a nonce, never read request state. Everything is backward-compatible: no nonce (SSG build / no-CSP) → no attribute → byte-identical output. The client styler already inherits the nonce from the reused SSR `<style>` (`.nonce` IDL property; PR #2173). **Fundamental limits (documented):** SSG/SPA can't carry a per-request nonce (use hash-based CSP); the client-entry `<script src>` relies on `script-src 'self'` (a `'strict-dynamic'` setup needs a separate template nonce). Streaming `renderToStream` nonce threading is a tracked follow-on.

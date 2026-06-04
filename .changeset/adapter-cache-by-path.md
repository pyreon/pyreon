---
"@pyreon/zero": patch
---

fix(zero): node/bun adapters cached `immutable` by file EXTENSION, not by hashed-asset path — deploy-poisoning bug

The self-hosted `nodeAdapter` / `bunAdapter` emitted-server handlers set
`Cache-Control: public, max-age=31536000, immutable` for **any** `.js`/`.css`
file, keyed on the extension. Vite only content-hashes files under `/assets/`;
a non-hashed root file — `public/sw.js` (service worker), `public/config.js`,
any unhashed `.css` — therefore got a **1-year immutable cache**, making a stale
copy effectively **unevictable** (a poisoned service worker is the classic
deploy-breaking case). The platform adapters (vercel / netlify) were already
correct — they scope immutable to `/assets/(.*)`.

The handlers now immutable-cache **only** paths under `/assets/` (Vite's hashed
output dir, matching vercel/netlify), serve `*.html` with
`public, max-age=0, must-revalidate` (prerendered pages change every deploy —
previously they could be served stale for up to an hour), and fall back to
`public, max-age=3600` for everything else (non-hashed `.js`/`.css`, images,
fonts, public assets).

Bisect-verified by the node + bun spawn-and-curl runtime-contract tests
(`adapters.test.ts`): a `/assets/*.js` returns `immutable` while a root `/sw.js`
must NOT — reverting to the extension-keyed handler fails both.

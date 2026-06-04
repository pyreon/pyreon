---
"@pyreon/zero": patch
---

fix(zero): SSR/ISR deploy follow-ups from code review (static .html, no double client-entry, adapter dedup)

Post-review quality fixes to the SSR/ISR deploy path:

- **Static `.html` assets are served again.** The node/bun production servers
  excluded ALL `.html` from static serving to stop `/` shipping the SSR
  template shell — but that also 404'd legit `public/*.html` assets (they fell
  through to the SSR handler with no matching route). Removing the `/` →
  `index.html` mapping already makes `/` server-render; the servers now serve
  any existing file (incl. `.html`), so a static `/legal.html` works while `/`
  still SSRs.
- **No double client-entry script.** `createServer` only auto-loads the built
  production template (`dist/server/template.html`) when the caller customized
  NEITHER `template` NOR `clientEntry` — previously an explicit `clientEntry`
  alongside the auto-template injected two module scripts. JSDoc now documents
  pairing a hand-supplied built `template` with `clientEntry: false`. (A missing
  template in the zero-config path is a build error the SSR plugin reports at
  build time + verify-modes / the ssr-node·isr-node e2e gate it — no runtime
  warning needed.)
- **Shared `stageClientThenServer` adapter helper.** All six deploy adapters
  staged client+server with a hand-maintained `'server'` entry in each
  `preserve` list (a silent-stomp foot-gun if one forgot it). The new helper
  derives the server segment from `serverEntry` and always preserves it,
  removing that duplication across node/bun/vercel/netlify/cloudflare.

Pure refactor + edge-case fixes — no change to the happy-path deploy output
(verify-modes + ssr-node/isr-node e2e unchanged green); adds a static-`.html`
runtime test (bisect-verified) + `stageClientThenServer` unit tests.

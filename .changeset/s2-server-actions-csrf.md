---
'@pyreon/zero': minor
---

fix(zero)!: server actions security baseline — full UUID + CSRF Origin check + auto-wire (S2)

**Bug (security-critical)**: `defineAction()` IDs were `crypto.randomUUID().slice(0, 8)` (32 bits → birthday collision at ~65k actions). The `/_zero/actions/<id>` endpoint accepted any POST with **no Origin / Referer check, no CSRF token, no SameSite enforcement**. Action IDs are bundled in client JS (trivially discoverable via DevTools). **Any malicious origin a logged-in Pyreon user visits could POST to any defined action** — classic CSRF.

Compounded by: `createActionMiddleware` was NEVER auto-wired by `createServer()`. The endpoint just 404'd for users who didn't manually wire — but those who DID wire it got insecure-by-default.

**Fixes (in this PR)**:

1. **Full 128-bit UUID** for action IDs ([actions.ts:70](packages/zero/zero/src/actions.ts#L70)). Matches the registry's UUID space — was just truncated.
2. **Same-origin Origin/Referer check** by default. Cross-origin POSTs are rejected with HTTP 403. Opt in to specific cross-origin callers via `corsOrigins: ['https://admin.example.com']`. Algorithm:
   - No Origin/Referer → ALLOW (server-to-server, curl, integration tests — the auth layer's job to gate on user identity).
   - Origin/Referer present → require same-origin OR an entry in `corsOrigins`.
   - Otherwise → 403.
3. **Auto-wire** `createActionMiddleware()` in `createServer()` when any `defineAction()` has registered (detected via the module-level registry size). Sits between API routes and route middleware. Pass `actions: false` to opt out, or `actions: { corsOrigins: [...] }` to configure.

**Breaking change**: Cross-origin POSTs to action endpoints now require explicit `corsOrigins` opt-in. Same-origin POSTs (the common case) work unchanged. Matches Astro Actions / SvelteKit csrf / Next Server Actions defaults.

**Out of scope for this PR** (separate follow-up):
- Per-session CSRF token + double-submit cookie pattern
- Encrypted action IDs tied to session (Next.js-style)
- Progressive-enhancement `<Form>` component

Bisect-verified: 4 of 8 new tests fail with source reverted (`expected 'action_6faddc85' to match /full-UUID-shape/`; `expected 200 to be 403` on 3 cross-origin REJECT tests). Restored → 1012/1013 zero tests pass (1 pre-existing skip + 8 new). Typecheck + lint clean. 115 e2e green.

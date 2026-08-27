---
"@pyreon/router": minor
"@pyreon/server": patch
---

Fix redirect target handling: cross-origin redirects now actually work on the
client, and client + server agree on what a target means.

Two defects were tangled together. **Functional**: `redirect()`'s docs promised
cross-origin support (`redirect('https://provider.com/oauth')`), but the client
router rewrote EVERY absolute URL to `/` via `sanitizePath` — so a cross-origin
redirect silently failed to `/` on an SPA navigation (breaking e.g. an OAuth
hand-off), while the SSR handler emitted it verbatim. **Security**: that same
client/server disagreement meant a guard a developer verified on the client (which
blocks absolute URLs) did not hold on the server (which emitted them raw).

A single shared classifier — `classifyRedirectTarget` (exported) — now drives
BOTH paths:

- **`external`** (an explicit `http(s)://` URL): a real `window.location`
  navigation on the client (was silently `/`), a `Location:` header on the server.
  The target is trusted to the caller — validate an untrusted `?next=` value
  against an allowlist, exactly as with any framework (Remix/Next model); the
  `redirect()` JSDoc now says so.
- **`block`** (protocol-relative `//host`, or a non-`http(s)` scheme like
  `javascript:` / `data:` / `mailto:`): refused and routed to `/`, on both the
  client redirect application and the server `Location:` (`safeRedirectLocation`).
- **`internal`** (a same-origin path): an in-router SPA navigation, unchanged.

Bisect-verified: reverting the client external branch fails a cross-origin
redirect (no real navigation); reverting the server sanitizer emits
`javascript:alert(1)` as the raw `Location`. Full `@pyreon/router` 758/758 +
`@pyreon/server` 256/256, typecheck + lint + budgets clean. `push`/`replace` of a
string path and route-config redirects keep their same-origin-only behavior.

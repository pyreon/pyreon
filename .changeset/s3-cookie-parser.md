---
'@pyreon/zero': patch
---

fix(zero): parseCookies preserves values containing `=` (JWTs / base64 sessions) — S3

**Bug**: `parseCookies` (used by the i18n middleware to read the locale cookie) did `pair.trim().split('=')` then destructured `[key, value]` — taking only the first two elements of an N-element split. Any cookie value containing `=` (every base64-encoded session ID's `=` padding, every JWT, any URL-encoded `=` in value position) got silently truncated.

**Today's impact is bounded**: only the locale cookie is currently read via this helper. But the shared parser is a latent footgun for any future auth / session cookie consumer; the same parsing function copy-pasted into user middleware would silently corrupt every JWT it touched.

**Fix**: split on the FIRST `=` only via `indexOf('=') + slice`. Matches the working pattern in `packages/core/router/src/match.ts:51-59` (`parseQuery`). Exposes the helper as `_parseCookiesForTesting` (internal, not part of public API) so the regression suite can exercise the parser directly.

Audited all `split('=')` destructure patterns in `packages/zero/zero/src/`, `packages/core/server/src/`, `packages/core/router/src/` — only the just-fixed instance exists. A `pyreon/no-truncating-split-destructure` lint rule to prevent recurrence is tracked as a follow-up in the [audit-fix campaign plan](.claude/plans/jaunty-herding-kazoo.md) (PR 3 has the rule on its docket; deferred to keep this PR scope tight).

8 new regression tests in `i18n-routing.test.ts` covering: base64 padding, multi-`=` values, JWT-shaped tokens, multi-cookie boundary safety, URL-encoded value decode, empty / malformed entries, missing header. All 8 fail with source reverted; restored → 1013/1014 zero tests pass (1 pre-existing skip).

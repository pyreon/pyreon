---
'@pyreon/router': patch
'@pyreon/zero': patch
---

A malformed percent-escape in a URL no longer 500s an SSR app

`decodeURIComponent` throws `URIError` on a lone `%`, `%zz`, or a truncated multi-byte escape. Every decode in `@pyreon/router`'s matcher is applied to attacker-supplied text — a path segment, a query key, a query value — and the matcher is reached PRE-AUTH from `router.preload` inside the SSR handler. So `GET /?q=%` was an unauthenticated 500 on every server-rendered Pyreon app: one character, no auth, and a STATIC route, because the QUERY parser decodes too and no dynamic parameter is needed.

The matcher is a pure function with no HTTP context, so it cannot answer 400; an undecodable segment now resolves to its literal text, which keeps matching total and leaks nothing. Well-formed encoding is untouched (`/posts/a%20b` still yields `a b`) — this is a guard, not a retreat from decoding. A host that wants to reject malformed URLs should validate before routing.

`@pyreon/zero`'s server-islands fragment endpoint (`GET /_pyreon/fragment/<name>`) had the same unguarded decode on the same pre-auth path; unlike the matcher it HAS a request context and already answers 400 for a malformed name, so a malformed escape joins that branch rather than falling through as raw text.

The adapters (`bun.ts`) and `url-guard.ts` already guarded this, so the unguarded sites were an oversight rather than a policy.

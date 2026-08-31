---
'@pyreon/lint': minor
---

New rule `pyreon/no-close-before-handler-teardown` (warn, client + shared
files) — a socket's `close()` called before its handlers are detached.

`close()` starts a handshake rather than ending the connection, so a buffered
frame can still reach a handler that is still attached and write into a scope
the teardown has already disposed. The rule locks the order that
`@pyreon/query`'s `use-subscription.ts` was fixed to in this same release.

Bisect-verified against the real defect rather than a fixture: run over the
pre-fix file it reports both sites, and over the fixed file it reports none.
That check is what caught the rule's first cut being **inert** — it matched
only statements in the same block, while the shipped code guarded its close as
`if (ws.readyState === WebSocket.OPEN) { ws.close() }` with the nulls after, so
the rule found nothing at all in the one file it was written for. It now takes
a `close()` from anywhere in an earlier statement's subtree, while still
ignoring one inside a nested function (that body runs later, if ever) and
declining to guess when the null assignments themselves are conditional.

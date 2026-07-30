---
'@pyreon/router': patch
---

The browser Back tests waited a fixed number of milliseconds, and flaked in CI.

`router.browser.test.tsx` drove real browser traversals with
`window.history.back(); await flushMs(150)`. That encodes a guess about how long
Chromium takes to fire popstate AND how long the router's navigation pipeline
takes to run — and since the Back pipeline now does the full job (loaders,
guards, blockers, afterEach, scroll, title) rather than a bare state sync, 150ms
is not enough under CI load.

It surfaced on #2553, a bench-hygiene PR touching only `scripts/`, which cannot
affect the router at all. It ran the browser suite because any `scripts/**`
change forces `--filter=*`, and then failed with
`expected '/about' to be '/posts'` — the assertion running before the pipeline
finished. The same suite passes 46/46 locally on that exact branch, and main was
green: the signature of a load-dependent timing flake, not a regression.

Three of the four fixed sleeps are now condition polls (`waitUntil(pred, label)`
with a generous 4s BACKSTOP — a passing case costs one 20ms interval, so the
budget only matters when the test is already failing, and a timeout now names
what it was waiting for instead of asserting on a half-finished navigation).

The fourth is deliberately NOT converted, and that is the interesting one. It
asserts a BLOCKED traversal changes nothing, so its expected end state is
identical to its start state — any predicate would pass instantly, before
Chromium had even moved the URL, and the test would assert nothing at all.
A fixed wait is the only honest option for proving the absence of a change; its
budget is raised from 250ms to 1200ms because it must cover the traversal event,
the pipeline, and the restoring `go()` round-trip.

Verified the poll is load-bearing rather than a no-op: making one predicate
unsatisfiable fails with `waitUntil timed out after 300ms: Back to settle on
/posts with the loader re-run`, so it genuinely waits. 46/46 pass restored.

---
'@pyreon/runtime-dom': patch
---

Fix a reactive boundary destroying its own children when its accessor re-runs
with an unchanged value.

`mountReactive` tore down and re-mounted on EVERY effect re-run. That is merely
wasteful for most shapes and destructive for the one the compiler now emits: a
component's sole child is `_lc`-memoized, so `<Show>`'s accessor hands back the
SAME `_tpl` NativeItem whose DOM and bindings were built once. The teardown
disposed those bindings and the remount re-inserted the same element without
rebuilding them — leaving one live node, permanently stale, with no warning.

It needed a `when` accessor that RE-RUNS while its verdict is unchanged, which
is ordinary: `when={() => selected() !== undefined}` re-runs on every
`selected` change and stays `true`. Found building a generated API client,
where picking a second item left the detail view pinned to the first.

`mountReactive` now skips the teardown when the accessor returns the value
already mounted. Identity is deliberately the test: every shape that builds a
fresh value per run compares unequal and behaves exactly as before, so only a
value literally already in the DOM is skipped. It is also a real reduction in
churn — a `<Show>` over a frequently-changing signal no longer rebuilds its
branch on every change (counted by `runtime.mountReactive.identitySkip`).

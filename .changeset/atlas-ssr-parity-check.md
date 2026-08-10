---
'@pyreon/atlas': minor
'@pyreon/mcp': patch
---

Add the SSR-parity verify check — does each scenario survive `renderToString` + hydrate?

A hydration mismatch is the framework's own first-class bug class: the SSR↔hydration differential fuzz found six shipped instances, every one a cursor misalignment where the server's HTML and the client's expectation disagreed about how many DOM nodes a construct occupies. None of Atlas's other checks could see it — `interaction` mounts on the client and never renders on a server, and `snapshot` photographs one render, so a build that is consistently wrong photographs consistently. Every scenario a catalog already has now becomes a parity test at zero authoring cost.

**Two oracles, because one is not enough.** The runtime's own mismatch channel must report nothing, AND the hydrated DOM must equal a fresh client mount. The second exists because the first can agree on broken — an SSR pass and a hydrate pass reaching the same wrong DOM produce zero mismatches, and only an independently-built third instance reveals it.

`VerifyVerdict` gains a sixth check, `ssrParity`. Consumers reading the catalog's verdict shape see one more field; `verify-browser` carries the node-side verdict through rather than recomputing it.

**Honest limits, stated in the source rather than discovered later.** The check is BLIND to `typeof window` branching: both renders happen in one process with DOM globals installed so components can mount at all, so the "server" pass sees a browser too and the two sides agree. What it does catch is non-deterministic renders (`Math.random()`, `Date.now()`, per-render ids), components that throw only under `renderToString`, and the framework's own cursor-misalignment class. It skips with a reason when `@pyreon/runtime-server` is not installed, since a component library with no SSR story is a legitimate project.

Verified end to end, not just unit-tested: against the 43-scenario workshop catalog it reports 43 passes, and perturbing a real component to render non-deterministically moves the scan to 39 verified / 4 failing with a source-anchored finding (`text at root > button > reactive: expected 12, DOM had 11`).

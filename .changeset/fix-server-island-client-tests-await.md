---
"@pyreon/server": patch
---

fix(server): island-client-render tests await async wrapper

PR #1335 added `island-client-render.test.tsx` with assertions on `vnode.type` and `props.ref`, but the IslandWrapper is an `async` function — calling it synchronously returns a Promise, not a VNode. Every assertion was vacuously passing because the Promise wasn't `pyreon-island` and `props.ref` was never set by the wrapper.

This PR rewrites the tests to:
- `await` the async wrapper
- Assert on the actually-emitted VNode shape (`data-hydrate`, `data-name`, `data-props`, `data-prefetch` attrs)
- Cover the hydrate=never short-circuit + the prefetch=idle/visible branch combinatorics
- Note that full client-side scheduling (onMount → dynamic client import) is covered by sibling `islands.browser.test.tsx` in real Chromium

Coverage remains lifted (95.78% statements, 86.93% branches on server).

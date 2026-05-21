---
'@pyreon/runtime-dom': patch
---

Fix `mountReactive` using stale closure-captured parent — surfaced by
`<For>` of `<Show>` under batched signal toggles. `<For>` mounts its
children into a `DocumentFragment` and then moves the fragment's
contents to the live parent via `liveParent.insertBefore(frag, …)`.
After the move, every inner `mountReactive`'s closure-captured `parent`
referenced the now-empty fragment, while its marker had been carried
along to the real live parent. The next signal flip ran the effect's
mount call against the stale parent, throwing
`NotFoundError: Failed to execute 'insertBefore' on 'Node'` —
which Pyreon caught as an unhandled effect error, dropping the entire
For's children from the DOM (count went from N to 0).

Fix: `mountReactive` now reads `marker.parentNode` at each effect run
and falls back to the closure-captured `parent` only if the marker is
detached. This is consistent with the cleanup path, which already used
`marker.parentNode?.removeChild(marker)`. Surgical, single-line change
(plus a fallback for the detached-marker edge case).

Bisect-verified against the new browser CONTRACT spec
`packages/core/runtime-dom/src/tests/show-of-for-batched-toggle.browser.test.ts`:
reverting the swap reproduces the exact NotFoundError + 0-of-100
children. 45/45 runtime-dom browser tests and 681 unit tests pass.

Discovery chain: PR #770 (leak-audit harness) → PR #772 (leak-sweep
multi-journey driver, surfaced this bug) → PR #774 (it.fails CONTRACT
lock).

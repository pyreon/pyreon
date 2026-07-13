---
"@pyreon/url-state": minor
---

URL-state excellence pass — cross-hook sync (fixed), atomic batch updates, `clearOnDefault`, and doc-drift elimination:

- **Cross-hook sync (fixed broken promise)**: two `useUrlState('page', 1)` calls bound to the same key were independent signals that DESYNCED — `a.set(5)` updated the URL but left `b()` stale (a raw `history.replaceState` emits no `popstate`). The `onChange` "fires when another `useUrlState` writes the same param" contract, documented on 4 surfaces, never worked. Now every live signal for a key stays in sync: after any write, sibling signals re-read the URL and fire their `onChange` (the writer's own `onChange` does not fire). Backed by an identity-cleaned module-level subscriber registry (Set.delete + drop-empty; tied to the owning effect scope).
- **`batchUrlUpdates(fn)`**: coalesce several `.set()` / `.reset()` / `.remove()` calls into ONE history entry (one `replaceState` / `pushState` / `router.replace`). Critical with `replace: false`, where an N-param update previously pushed N back-stack entries. Signal values still update synchronously inside the batch; reactive notifications coalesce; debounce is bypassed. Matches nuqs's `useQueryStates` batching.
- **`clearOnDefault` option** (default `true`): pass `false` to keep a param written in the URL even at its default value (canonical shareable links, analytics).
- **Doc-drift fixes**: the README/manifest claimed invalid numbers coerce to `0` (they fall back to the **default**), that `?dark=1` is `true` (only the exact string `'true'` is), and the manifest said `debounceMs` (the option is `debounce`) and self-contradicted on SSR ("reads the request URL" — it does NOT; it uses defaults server-side). All corrected across README, manifest, docs, and JSDoc.
- **New competitor benchmark** vs nuqs (`bun run bench:nuqs`, per-op process isolation): url-state wins array parse 6.2× / array serialize 2.6× / boolean parse 2.2×, ties string + number serialize + round-trip, and is within ~1.2× on scalar number parse (the cost of the `defaultValue`-capturing closure that powers NaN→default — a Pareto trade on a once-per-read path).
- Internal `url.ts` refactor: one `commit()` funnel for the router-vs-history branch (was duplicated), plus `commitParams` for atomic multi-param writes.

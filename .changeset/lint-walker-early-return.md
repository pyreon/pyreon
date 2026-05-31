---
'@pyreon/lint': patch
---

fix(lint): `pyreon/no-unbatched-updates` walker now respects early-return semantics

Follow-up precision fix to the per-path-max walker shipped previously. The walker summed sequential statements after a conditional `return` / `throw`, even though those statements are unreachable on the early-exit path. Two paths exist: (A) take the early exit, (B) fall through — the walker now takes MAX instead of summing.

Closes the canonical `@pyreon/query` `use-subscription.ts` `connect()` false positive (PR #1124 documented this gap):

```ts
function connect() {
  if (typeof WebSocket === 'undefined') return
  // ...
  if (!isEnabled()) { status.set('disconnected'); return }  // early exit
  status.set('connecting')
  try { ws = new WebSocket(...) }
  catch { status.set('error'); scheduleReconnect(); return }
  ws.onopen = (e) => { batch(() => { status.set('connected') }) }
  // ...
}
```

Real max-path = 2 (status('connecting') + catch's status('error')). Pre-fix walker summed `!isEnabled` early-exit set + main flow set + catch set = 3 → flagged. Post-fix: 2 → silent.

New `alwaysReturns(node)` helper detects always-returning statements: `ReturnStatement`, `ThrowStatement`, `BlockStatement` with any always-returning member, `IfStatement` with both arms always-returning, `TryStatement` with appropriate try/catch/finally combinations.

`BlockStatement` walking now uses a 2-track scheme:
- `cumulative` — sum along the "continuation" (fall-through) path.
- `branchMax` — max-so-far across already-taken early-exit paths.
- Final block contribution: `max(cumulative, branchMax)`.

Real-corpus impact:
- Before this fix: 21 sites (after the per-path-max baseline)
- After this fix: **16 sites** — 5 more false positives silenced
- vs original function-scope-sum rule: 31 → 16, **15 total false positives silenced** across the precision sequence

7 new specs in `rule-batch-2.test.ts` cover: early-exit with 2 vs 3+ sequential continuation, real-app SSE connect shape, throw-statement early exit, if/else with consequent-returns, nested early-return composition. Bisect-with-restore proven against the real `use-subscription` shape.

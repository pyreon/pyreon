---
'@pyreon/compiler': minor
'@pyreon/runtime-dom': minor
---

perf(compiler+runtime-dom): widen `_bindText`/`_bindDirect` fast path to non-computed MemberExpression callees

`tryDirectSignalRef` previously accepted ONLY bare-identifier callees (`count()`). The canonical For-row idiom `{() => row.label()}` — exactly what the hand-tuned `examples/benchmark/src/impl/pyreon-tpl.ts` reference template uses — bailed to the full `_bind` chain (~6 allocs: deps array, dispose closure, snapshotCapture, scope.add) instead of the `_bindText` fast path (1 dispose).

Now widened to non-computed MemberExpression chains (`row.label()`, `data.user.name()`) where the root identifier is NOT a tracked active signal (which would suggest `count.peek()` — intentionally untracked, would defeat the binding). Computed access (`row[key]()`) and chained calls (`count().toLocaleString()`) still bail to `_bind`.

To keep correctness, `_bindText` and `_bindDirect` gain an optional 3rd `caller?` arg. The compiler emits it for MemberExpression callees: `_bindText(row.label, t, () => row.label())`. The runtime's slow path uses it instead of bare `source()` — preserves `this` if source turns out to be a method (not a signal). Fast path ignores the caller (no perf cost). The 2-arg form remains valid for Identifier callees (backward compatible).

Both JS and Rust compiler backends implement the widening byte-identically (verified by cross-backend equivalence tests).

Bisect-verified: revert widening → 4 new compiler tests fail (`_bindText(row.label,` not in `_bind`-only output); restore → 4 pass. Bench:fair shows `replace all` 0.96× and `create 10k` 0.98× directionally, within between-run noise band (untouched Solid moved 0.85–1.02× in the same comparison); no regressions across 165 e2e tests.

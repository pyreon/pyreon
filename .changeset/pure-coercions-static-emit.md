---
'@pyreon/compiler': minor
---

perf(compiler): classify `String`/`Number`/`Boolean` as pure coercions — `{String(row.id)}` routes to static `textContent` (no `_bind`)

The compiler conservatively treated every `CallExpression` as dynamic unless ALL args were literals (`isPureStaticCall`). The canonical For-row idiom `{String(row.id)}` — exactly what `examples/benchmark/src/impl/pyreon-tpl.ts` (the hand-tuned reference) uses — failed the literal-arg test (`row.id` isn't a literal) so emitted the full `_bind` chain per row (`createTextNode` + `appendChild` + `_bind(() => { textNode.data = String(row.id) })`).

`String`, `Number`, `Boolean` are referentially-transparent globals: their result depends ONLY on the argument. Now classified as pure coercions — the OUTER call no longer triggers an early dynamic-return, and the existing recurse-into-children logic determines dynamism from the args:
- `String(row.id)` — captured row ref, NOT dynamic → routes to `emitStaticTextChild` (`textContent = String(row.id)` once at row mount)
- `String(count())` — signal call in arg, IS dynamic → preserves `_bind` reactivity
- `String(props.x)` — props access in arg, IS dynamic → preserves `_bind` reactivity
- Spread (`String(...args)`) bails

Both JS and Rust backends implement byte-identically. Matches the static emit pattern the hand-tuned bench template uses.

Bisect-verified: revert → 3 "fires" tests fail (`textContent = String(row.id)` not in `_bind`-only output); restore → pass. `bench:fair`: Pyreon `create 1k` 0.97× directionally; other cells within noise band. 1421/1421 compiler tests + 150 e2e green.

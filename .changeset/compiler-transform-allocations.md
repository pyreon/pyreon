---
"@pyreon/compiler": patch
---

perf: cut per-node allocations in the JS transform (byte-identical output)

Internal transform-speed improvements to the JS backend (the fallback path; the
Rust backend is the default). Emitted output is byte-identical — verified against
the full compiler suite plus a client+SSR differential across signal auto-call,
prop-derived, event, SSR-attr, and element-var shapes.

- `scopeBoundSignals` / `scopeBoundPropDerived` are called for every AST node of
  every signal-/prop-referencing expression (the highest cumulative node-visit
  count in the transform). Each unconditionally ran `out.filter(closure)` — a
  fresh closure + array — even though `out` is empty for the overwhelmingly common
  node kinds. Guarded with `if (out.length === 0) return out` (the local `out` is
  a fresh array per call, so returning it is identical to returning `[].filter`).
- Three inline `/^on[A-Z]/` regex literals now reuse the existing module-level
  `EVENT_RE` (a regex literal is re-allocated per evaluation); the SSR `/[A-Z]/`
  and element-var identifier regexes are hoisted to module-level `UPPER_RE` /
  `IDENT_RE`. No `g`/`y` flags, so the shared instances are stateless under `.test`.

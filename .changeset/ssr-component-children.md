---
"@pyreon/compiler": patch
"@pyreon/runtime-server": patch
---

perf(ssr): component children compile to `_ssr` holes instead of bailing the whole wrapper

A component child was the single largest remaining hole in the compile-to-string SSR fast path. `<main class="m"><Widget /></main>` emitted **zero** `_ssr` — the wrapper fell to the slow `h()` path — and because every level of a real page is a wrapper containing a component, the bail compounded with nesting depth.

Measured on a realistic page (nested layout wrappers around six components): **before, the root stayed raw JSX with two salvaged `_ssr` fragments; now the entire page skeleton is ONE `_ssr` call** with nine static segments and eight holes.

A component's output is only knowable at runtime, so it becomes a hole rather than baked statics. The new `_ssrNode` runtime export is a one-line delegation to the existing `renderNode` — deliberately, because the bytes must match `h()` exactly or hydration breaks, and `renderComponent` already owns the two subtleties a reimplementation would get wrong: a sync child inlines with NO markers while an async one is bracketed by `<!--$pas-->`/`<!--$pae-->`, and the context stack is trimmed so a `provide()` frame cannot leak into later siblings.

The emit BRACKETS rather than spans. Replacements must be disjoint, so instead of one edit across the element, the surrounding text is emitted as separate edits around each child's preserved source range, which is then re-walked so its props transform in place. That means zero duplication of the reactive-prop machinery — the thing that makes two backends drift.

Landed in BOTH backends; a JS-only change would ship nothing, since native is what most users compile with.

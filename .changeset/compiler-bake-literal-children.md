---
'@pyreon/compiler': patch
---

Bake LITERAL expression children into the template HTML. `{"t"}`, `{54}`,
`{null}`, `{true}`, `{undefined}` and a substitution-free template literal used
to emit a `<!>` placeholder plus `_setChildAt(parent, p, "t")` — a runtime call
per literal on every mount — while plain JSX text baked. They now bake exactly
like plain text (escaped for the template parser; `&` and `>` unconditionally,
since a JS string is data, not markup), adjacent texts merge into ONE entry the
way the parser merges them, and null/boolean/undefined bake nothing, which is
the JSX contract (the old `{false}` → "false" divergence is closed).

Why it matters beyond the mount call: the server renders the same literal as
plain text with no range markers, so the compiled-template adopt verifier found
a placeholder with no `$` range and bailed — this ONE shape was every root swap
(78 of 300 seeds) the compiled-path hydration parity fuzz recorded. A numeric
literal bakes only when its source is its `String()` form (plain decimal, no
exponent/leading zeros/trailing fraction zeros, ≤ 15 digits); `1.50`, `1e3`,
`-1` keep the runtime path. Both backends, byte-identical (native-equivalence +
the differential fuzz).

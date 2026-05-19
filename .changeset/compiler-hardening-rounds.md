---
'@pyreon/compiler': patch
---

Compiler hardening sweep (10 systematic rounds — edge cases, miscompiles,
memory, cross-backend). Two real correctness bugs fixed; two more proven,
root-caused, and locked with self-discriminating tests (fixes scoped as
follow-ups); the rest disproved and locked with contract/characterization
tests so the verified behavior cannot silently regress.

Fixed (behavior changes):

- Scope-blind prop-derived inlining (silent miscompile + un-parseable emit).
  The reactive-props inlining pass substituted any identifier whose NAME
  matched a prop-derived const, with zero lexical-scope analysis. Idiomatic
  code reusing a short name (a / x / i / item) as a later callback parameter
  or nested local was MIS-COMPILED: a prop-derived const named the same as a
  ".map" arrow parameter produced an arrow whose parameter was rewritten to a
  member expression (un-parseable JS); a shadowing catch parameter likewise
  produced un-parseable output; a nested "const a = 7; return a" silently
  became "return props.x". The substitution is now lexically scope-aware
  (scopeBoundPropDerived plus a shadowed set threaded through the walk),
  mirroring the discipline the signal-auto-call pass already had. Genuine
  (non-shadowed) and transitive inlining is unchanged. Bisect-verified.

- Raw C0 control bytes in source string/regex literals. The FNV-1a
  rocketstyleCollapseKey builder embedded literal NUL and SOH bytes as field
  separators (and a CLI ANSI module embedded a raw ESC), which classified the
  compiler's primary source as binary (grep/rg silently skip it) and made a
  cache-key separator silently mutable by formatters/editors. All replaced
  with byte-identical Unicode escape sequences; the emitted FNV key is
  provably unchanged. A repo-wide self-discriminating gate prevents
  reintroduction.

Proven + locked (fixes scoped as tracked follow-ups, guarded by an it.fails
spec that flips green-to-red the moment the fix lands):

- JS-vs-Rust backend divergence: the native backend does not inline
  prop-derived consts used inside callback-nested JSX (the
  "const cls = props.t; items.map(i => <li class={cls}/>)" shape), so that
  ubiquitous pattern silently loses reactivity under the production
  (native-preferred) path. Root cause: collect_prop_derived_idents in
  native/src/lib.rs has no recursion arm for arrow/function/JSX nodes.

- Element-valued const used as a bare JSX child is text-coerced
  (createTextNode(x), which renders [object Object]) instead of mounted, even
  though the compiler already lowered the const to a _tpl(...) call and thus
  knows it is an element.

No public API change. The new test suites add coverage only.

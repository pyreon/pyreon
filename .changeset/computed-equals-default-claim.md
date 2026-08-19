---
'@pyreon/reactivity': patch
---

Correct the `computed({ equals })` docs — there is no default equality check

The manifest told users `equals` "defaults to `Object.is`". It does not.
`computed.ts` reads `options?.equals ? computedWithEquals(fn, …) : <plain
computed>`, so WITHOUT `equals` a computed notifies downstream on every
dependency change even when the recomputed value is byte-identical.

The asymmetry is the part nobody expects: a SIGNAL write does gate on
`Object.is` (`set(same)` is a no-op), so it is reasonable to assume a computed
does too. It does not, and the claim propagated to the MCP api-reference and
the generated reference page — i.e. to AI assistants writing Pyreon code.

This is a performance claim, not a wording nit. `computed(() => items().length)`
re-runs its effects on every item mutation that leaves the length alone. A
memoization-wall benchmark measured the gated form at the Vanilla floor (12µs)
and the BARE form users actually write at 46µs — last in the field, behind
every competitor. The docs were describing the fast path while handing out the
slow one.

Corrected in the manifest (the single source), with a `mistakes` entry so the
footgun surfaces in `get_api` rather than only in prose, and regenerated into
both derived surfaces. No runtime change.

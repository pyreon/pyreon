---
'@pyreon/rocketstyle': minor
---

Split `.attrs()` into two explicit overloads (callback form first, object form second) AND widen the DFP (calculated final props) type so JSX call sites with EA (extended-attrs) generics don't require redundant prop annotations.

**Overload split**: `attrs(callback, config?)` and `attrs(object, config?)` were one polymorphic signature. TS picked the wrong one for `<P>`-typed object literals (the callback overload distributes `Partial<DFP & P>` over the callback's props arg; the object overload binds `P` directly to the literal). Splitting into two declarations lets TS pick the structurally-correct overload at the call site.

**Asymmetric callback shape** (Pyreon-specific): callback PROPS narrow to `Partial<DFP & P>`, callback RETURN stays loose as `Partial<P> & Record<string, unknown>`. This preserves the convention where `.attrs()` callbacks return runtime-only fields like `_documentProps` / `tag: 'a'` overrides that aren't on the user's `<P>` generic.

**DFP widening with `OA extends infer O` distribution**: `MergeTypes<[OA, EA, DefaultProps, ExtractDimensionProps<...>]>` now distributes over each branch of `OA` (when `OA` is a union, e.g. from a multi-overload base component). Pairs with PR #565 (`ExtractProps` overload narrowing) — DFP now correctly fans out across every overload's props instead of collapsing to the last one.

**`NoInfer<DFP>` on the object form** (TS 5.4+): prevents TS from inferring `P` from `DFP` in the second overload — `P` must come from the user's literal or stays at its `TObj` default. Fixes "no overload matches this call" errors at consumer call sites in `document-primitives`, `ui-components`, `ui-primitives`. Mirrors vitus-labs commit.

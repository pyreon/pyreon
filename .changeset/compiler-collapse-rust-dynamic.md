---
'@pyreon/compiler': patch
---

The Rust native backend now implements the DYNAMIC-prop rocketstyle-collapse
variants (`__rsCollapseDyn` + the handler-combined `__rsCollapseDynH`) —
byte-for-byte identical to the JS backend. PR 3/N of pairing collapse to Rust
(builds on the full + on*-handler-partial foundations).

`detect_dynamic_collapsible_shape` composes TWO relaxations onto the full bail
catalogue: an `on[A-Z]…` handler is peeled, AND exactly ONE prop whose value is
a ternary of two string literals (`state={cond ? 'a' : 'b'}`) is captured as a
DynamicCollapsibleProp. Two+ ternaries bail (2^N axis blow-up is a separable
scope); zero ternaries defer to the other detectors. The emit expands the ternary
into truthy + falsy resolver lookups, requires matching templateHtml (one `_tpl`
reused across both values), builds the stride-2 value-major class array
`[v0_light, v0_dark, v1_light, v1_dark]`, and emits `__rsCollapseDyn(html,
classes, () => (cond) ? 0 : 1, () => __pyrMode() === "dark")` — or the
handler-combined `__rsCollapseDynH(…, handlerObj)`. Unions BOTH values' rule
bundles (dedup by ruleKey). The dynamic paths set ONLY their own import flag
(not needs_collapse), so the preamble gate widened to
`needs_collapse || needs_collapse_dyn || needs_collapse_dyn_h` (matching JS).

The JS force-route still routes collapse to JS until all variants land
(element-child remains, then the force-route removal + vite-plugin native
wiring). Verified: 11 cross-backend equivalence fixtures (no-handler / +handler /
+extra-prop / brace-wrapped / complex-cond / multi-handler / half-resolved bail /
template-mismatch bail / two-ternaries bail / non-literal-branch bail / rule
dedup), all JS≡Rust; full compiler suite 1553/1553. Bisect-verified: disabling
the dynamic fallthrough diverges 7 fixtures; restored → 324/324.

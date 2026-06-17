---
'@pyreon/compiler': patch
---

The Rust native backend now implements the on*-handler PARTIAL rocketstyle-collapse
variant (`__rsCollapseH`) — byte-for-byte identical to the JS backend. PR 2/N of
pairing collapse to Rust (builds on the full-variant foundation).

`detect_partial_collapsible_shape` is the EXACT full bail catalogue with ONE
relaxation: an `on[A-Z]…` handler in a `{expr}` container is PEELED into the
handler list (an event binding never changes the SSR-resolved styler class) while
the literal-prop subset still feeds the UNCHANGED collapse key. The orchestrator
falls through to the partial path only when the full shape is absent (a full shape
with an unresolved key bails outright — it can never be a partial site). Emits
`__rsCollapseH(html, light, dark, () => __pyrMode() === "dark", { "onClick":
(<sliced expr>), … })`, brace-wrapped as a JSX child; each handler expression is
re-emitted verbatim from its source span (paren-wrapped). Sets both
needs_collapse + needs_collapse_h (matching JS — a partial-only module imports
both helpers; the unused one tree-shakes out).

The JS force-route still routes collapse to JS until all variants land (dynamic +
element-child remain). Verified: 8 cross-backend equivalence fixtures
(top-level / brace-wrapped / multi-handler+multi-prop / comma-sequence body /
handler-only / unresolved / non-handler-{expr} bail / zero-handlers→full), all
JS≡Rust; full compiler suite 1542/1542. Bisect-verified: disabling the partial
fallthrough diverges 5 fixtures; restored → 313/313.

---
'@pyreon/compiler': patch
---

The Rust native backend now implements the ELEMENT-CHILD rocketstyle-collapse
variant — byte-for-byte identical to the JS backend. PR 4/N of pairing collapse
to Rust; this completes the compiler-side port of ALL four collapse variants
(full / on*-handler-partial / dynamic-prop / element-child).

Element-child reuses the UNCHANGED `__rsCollapse` emit (NO new runtime helper):
the resolver SSR-renders the REAL component WITH its child subtree and bakes the
full output HTML, so the cloned `_tpl` template already contains the children.
What's new in the compiler is the detection + keying:

- detect_static_element_child: a recursively-static DOM-child validator —
  lowercase tag, string-literal attrs only (no spread/boolean/{expr}/on*), and
  children that are static text or recursively-static elements.
- collect_static_children: text normalized via the SHARED clean_jsx_text (so a
  resolver reconstruction renders byte-identically); expression/fragment/spread
  children bail.
- serialize_static_children: deterministic C0-delimited serialization (mirror of
  the JS serializer; delimiters built from byte values so the SOURCE carries no
  raw control byte and no \u escape). Fed to the collapse key as childrenText so
  distinct subtrees get distinct keys (never colliding with a text-only key).
- detect_element_child_collapsible_shape requires ≥1 element child (text-only is
  the FULL-collapse shape); try_element_child_collapse emits the keyed __rsCollapse.
- Orchestrator fall-through is now full → partial → dynamic → element-child.

The JS force-route still routes collapse to JS — the remaining work is the
force-route removal + the vite-plugin native config wiring (the live-enabling PR).
Verified: 11 cross-backend equivalence fixtures (single / mixed-text+element /
recursive-nesting / multi-prop / brace-wrapped / text-only→full / component-child
bail / handler-child bail / expr-child bail / unresolved / dynamic-root bail), all
JS≡Rust; full compiler suite 1564/1564. Bisect-verified: disabling the
element-child fallthrough diverges 5 fixtures; restored → 335/335.

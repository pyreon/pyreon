---
"@pyreon/elements": patch
---

perf(elements): build the Wrapper props lazily so a plain `<Element>` skips them

`Element` is mounted on essentially every UI subtree, so its `buildBody` is one
of the hottest per-mount paths in the system. It eagerly built `wrapperLayout`
(a `computeWrapperLayout` call) **and** `WRAPPER_PROPS` on every mount — but the
**dominant** simple fast path (`isSimpleElement && !needsFix`, i.e. a plain
`<Element>`) returns via `WrapperStyled` + its own `buildSimpleBundle` and never
reads either one. So every plain Element paid:

- a wasted `computeWrapperLayout(isSimpleElement)` (the fast path recomputes its
  own layout in `buildSimpleBundle` — layout was computed **twice**), and
- a wasted `WRAPPER_PROPS` allocation: a 9-property object literal in the static
  case, or a `definePropsFromAccessors` with **six** `Object.defineProperty`
  getters in the reactive-layout case — allocated and thrown away.

`WRAPPER_PROPS` is now a lazy `buildWrapperProps()` builder, called only by the
three paths that consume it (empty / needsFix-simple / compound). All four
return paths keep their exact order, so precedence is unchanged and VNode output
is byte-identical.

Notes: the reactive-layout simple path additionally no longer reads the
wrapper-layout getters it never used, which on that path also avoids a spurious
outer-accessor subscription — a strict behavioural improvement (layout still
updates via the styler's class swap), not asserted by a separate new test.

Verified: full node suite (555) + the real-Chromium reactive suites
(slot-reactivity, reactive-prop-through-element, reactive-prop-class-sweep,
css-variables — 36 specs) all green; import + bundle budgets within limits
(element gz 4439 / budget 4442).

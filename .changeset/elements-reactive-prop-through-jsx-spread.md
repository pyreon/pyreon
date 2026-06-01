---
'@pyreon/elements': patch
---

fix(elements): Element / Text / Content preserve reactive getter props through JSX child-prop boundary

User report: `<RocketstyleButton href={signalAccessor() ? '/a' : '/b'} />` (or any rocketstyle component whose base is `@pyreon/elements` Element) silently lost reactivity on the `href` DOM attribute. Bare `<a href={signalAccessor() ? '/a' : '/b'}>` worked correctly. Multiple prior fix attempts targeted the rocketstyle pipeline + Wrapper helper correctly, but Element / Text / Content (which Wrapper wraps inside) still bled.

**Root cause** (empirically traced via runtime descriptor probes): `mount.ts:404-410` does `{ ...vnode.props, children: ... }` when `h(Comp, props, ...children)` is called with children as separate args (which is what JSX compilation produces). The JS-level spread fires every getter on `vnode.props` BEFORE `makeReactiveProps` ever sees the object — collapsing the `href` getter (`_rp(() => signal())` → `makeReactiveProps` getter descriptor) to a static string. The descriptor dies between Element's `h(WrapperStyled, result, children)` and the styled component's `DynamicStyled(rawProps)` boundary.

**The fix** (localized in Element / Text / Content, pattern from existing Wrapper):
- New `packages/ui-system/elements/src/helpers/buildSpreadProps.ts` extracts the descriptor-safe Wrapper pattern (Object.getOwnPropertyDescriptors + Object.defineProperty + extras + children) as a shared helper.
- Element (4 spread sites: void, fast path, compound-simple, compound-fallback), Text (1 site), Content (1 site) replace `<X {...rest}>` JSX with `h(X, buildSpreadProps(rest, { ...extras, children }))`. Children are routed THROUGH buildSpreadProps's overrides so `vnode.props.children !== undefined` → mount.ts's spread branch is skipped entirely → descriptors survive end-to-end.

API surface unchanged. No public API changes.

**Bisect-verified-with-restore**: 7 new specs in `packages/ui-system/elements/src/__tests__/reactive-prop-through-element.browser.test.tsx`. PRE-FIX: 6/7 fail with `expected '/initial' to be '/updated'` (only the void-tag path passes — it has no children so doesn't trigger the mount.ts spread). Per-component bisect: reverting Element fast path → only the Element fast-path spec fails (1/30). Reverting Text → 2 Text specs fail. Reverting Content → 1 Content spec fails. Each fix uniquely + minimally rescues its own specs.

POST-FIX: `@pyreon/elements` 497 node + 30 browser = 527 green. `@pyreon/rocketstyle` 309+37 = 346 green. `@pyreon/ui-components` 189+4 = 193 green. Grand total 1066 tests across the three packages, all green. Typecheck clean.

**Companion structural fix opportunity** (NOT in this PR): the deeper `mount.ts:404-410` spread is the bug class root — any framework component using `<Comp {...rest}>children</Comp>` JSX hits the same leak. A separate PR can replace mount.ts's spread with descriptor-copy via `Object.getOwnPropertyDescriptors` to close the bug class universally; this PR is the localized rescue.

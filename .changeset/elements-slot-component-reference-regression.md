---
'@pyreon/elements': patch
---

`Element` slot — **critical regression fix**: `beforeContent={Component}` / `afterContent={Component}` / `content={Component}` shorthand crashed every SSG build in 0.24.3.

PR #839 added `resolveSlot` to make function-valued slot props reactive (`content={() => <X />}`). The implementation called ANY function-typed slot value bare — which crashed the moment the consumer passed a component-reference shorthand, because component bodies (especially rocketstyle / attrs HOC chains) `Object.getOwnPropertyDescriptors(props)` and throw `TypeError: Cannot convert undefined or null to object` when invoked with no args:

```
TypeError: Cannot convert undefined or null to object
  at Object.getOwnPropertyDescriptors (<anonymous>)
  at removeUndefinedProps   (@pyreon/rocketstyle/lib/index.js:249)
  at HOCComponent           (@pyreon/rocketstyle/lib/index.js:327)
  at resolveSlot            (@pyreon/elements/lib/index.js:519)
```

Real-app impact: `bun run build` on a real consumer (bokisch.com 0.24.3) reported `[zero:ssg] Prerendered 0 page(s) + 404.html in 14ms (2 error(s))` — every page that used the shorthand failed.

**Fix**: `resolveSlot` discriminates component-reference functions (marked with `IS_ROCKETSTYLE` / `PYREON__COMPONENT` / `pkgName` by the framework's component factories) from plain reactive-accessor functions. Marked components mount as `h(Component, null)`; plain functions are called bare (preserves PR #839's reactivity fix).

```tsx
// All four shapes now work correctly:
<Element beforeContent={Logo} />                       // ← was broken in 0.24.3
<Element afterContent={Badge} />                       // ← was broken in 0.24.3
<Element content={Header} />                           // ← was broken in 0.24.3
<Element content={() => <Icon name={signal()} />} />   // ← PR #839's case, still reactive
```

Bisect-verified: reverting just the `isPyreonComponent` discriminator branch fails 4 of 6 specs in `slot-component-reference.test.tsx` with the exact `TypeError: Cannot convert undefined or null to object` users reported. Restored → 6/6 pass + all 469 elements tests pass + all 295 rocketstyle tests pass.

Mirrors the same fix in `Element/component.tsx` (5 JSX slot positions) and `Content/component.tsx` (1 JSX slot position).

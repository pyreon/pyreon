---
'@pyreon/rocketstyle': patch
---

Fix `.config({ component })` so it propagates the wrapped component's own prop types.

The chain's final props INTERSECT the wrapped component's props (`O`) with `DefaultProps`, which hard-codes `children?: VNodeChild`. Since `VNodeChildAccessor` is zero-arg (`() => …`), any component whose `children` is a render function — `(state: XState) => VNodeChild` — produced the unsatisfiable `((state) => …) & (VNodeChild | undefined)`, so `<Wrapped>{(s) => …}</Wrapped>` failed to typecheck (TS2322).

`DefaultProps` now only contributes keys the wrapped component does NOT declare (`Omit<DefaultProps, keyof O>`), letting the component's own types win. Components that declare no `children` still get `DefaultProps`' `VNodeChild` exactly as before, so this is additive.

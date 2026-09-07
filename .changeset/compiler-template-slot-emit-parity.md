---
'@pyreon/compiler': patch
---

Two template-emit fixes found by the new compiled-path hydration parity fuzz,
in both backends (byte-identical, native-equivalence locked):

- A DYNAMIC children expression in a template slot — `{props.children}` — is now
  wrapped in an accessor exactly as the h()/SSR emit wraps it (`shouldWrap`). It
  was passed BARE to `_mountSlot`, which handed the CHILD's own accessor to the
  slot: one reactive level on the client where the server markup carried two
  (`<!--$--><!--$-->x<!--/$--><!--/$-->`). Hydration adopted the outer range,
  mis-walked the inner one and mounted the child's text a second time
  (`<Comp>{() => sig()}</Comp>` rendered `propalphaalpha`); a reactive
  `children` prop was also frozen at bind time. A static local stays bare.

- `elementHasDynamic` now looks THROUGH fragments. `<b><i/><>{x}</></b>`
  flattens to a placeholder child of `<b>` at emit time, but `<b>` never got a
  phase-1 const, so its walk was inlined into the phase-2 `_setChildAt` and
  evaluated AFTER an earlier placeholder had been replaced —
  `null.replaceChild`, a client-mount crash on two fragment-wrapped texts in
  one template.

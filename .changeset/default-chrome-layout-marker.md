---
"@pyreon/router": patch
---

fix(router): register the PURE-call RESULT of the default-chrome layout so its `nativeCompat` marker survives tree-shaking

The synthesized `DefaultChromeLayout` (`<main data-pyreon-default-chrome>`, wrapping a layout-less `notFoundComponent` page) is registered with `match.ts` via a module-load `_setDefaultChromeLayout(...)` side effect. Under the `/* @__PURE__ */` PURE-form marker sweep it was registering the BARE function, so a real consumer bundle that imports `RouterProvider` (triggering the setter) but never the `DefaultChromeLayout` export dropped the `@__PURE__` `nativeCompat(...)` call as unused — registering an UNMARKED layout. Harmless today (the synthetic layout renders only via native `h()`, never a compat `jsx()` wrapper, and users never author it), but a latent trap if it ever gains setup-frame code or becomes user-referenceable. Now registers the PURE-call result `_DefaultChromeLayout`, keeping the call live and the marker applied — same runtime object, zero bundle cost. Locked by a bundle-level tree-shake regression test.

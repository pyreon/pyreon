---
'@pyreon/runtime-dom': patch
---

`Transition`, `TransitionGroup`, and `KeepAlive` are now marked native-compat via the PURE assignment form (`const _X = /* @__PURE__ */ nativeCompat(X); export { _X as X }`) instead of a bare module-level statement. Inside the built lib's shared chunk, the bare call was an unremovable side effect that retained all three component bodies in every consumer bundle — a `mount`-only app shipped ~1.2KB gz of dead transition machinery (measured on the krausest bench bundle: 15.2 → 14.0KB gz). Marker semantics unchanged (same fn object, locked by `native-markers.test.ts`); the new lib-level tree-shake spec (`native-compat-treeshake.test.ts`) locks the absence with a positive control.

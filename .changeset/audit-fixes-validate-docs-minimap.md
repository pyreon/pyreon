---
'@pyreon/validate': patch
'@pyreon/code': patch
'@pyreon/runtime-dom': patch
---

Core + fundamentals deep-audit fixes. `@pyreon/validate`: corrected the outdated "Pyreon does NOT ship its own validator runtime / ~1-2KB gz" claim across the entry docstring, README, manifest, and docs page — since v1 the package ships Pyreon's own `s` validator runtime; the accurate, measured contract is tree-shaking (DX-helpers-only import ≈0.5KB gz; the runtime ≈3.9KB gz pulled in only when `s`/primitives are imported). `@pyreon/code`: minimap's canvas click listener is now stored and explicitly removed in the plugin's `destroy()` — completes the destroy contract (the listener was element-scoped so it normally died with the canvas, but explicit removal protects against any external retention of the canvas). `@pyreon/runtime-dom`: fixed a misleading dev-gate comment in template.ts (claimed `import.meta.env.DEV`; the code correctly uses the bundler-agnostic `process.env.NODE_ENV !== 'production'` gate).

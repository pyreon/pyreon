---
'@pyreon/ui-core': minor
'@pyreon/rocketstyle': minor
'@pyreon/connector-document': minor
'@pyreon/document-primitives': minor
---

CSS-variables mode — FOUC fix (Phase 4b) + document export (Q2):

- `@pyreon/ui-core`: under `init({ cssVariables: true })` the ROOT `PyreonUI` now writes the mode attribute to `document.documentElement` (at `:root`, where the var rules cascade from and where a pre-paint script writes) and returns children unwrapped; only NESTED / `inversed` providers render the `display:contents` wrapper scoping an override to their subtree. New `cssVariablesPrePaintScript({ attribute?, storageKey?, fallback? })` builds the blocking `<head>` script that sets the attribute from localStorage / `prefers-color-scheme` before first paint — the standard dark-mode FOUC fix. (zero apps can keep using the existing `themeScript` export, which writes the same attribute.)
- `@pyreon/rocketstyle`: `resolveModeVar(value, mode)` — resolve a `mode(a, b)` var pair to its raw light/dark value for non-CSS render targets (document export), backed by a registry the var-pair factory populates.
- `@pyreon/connector-document`: `resolveStyles` + `extractDocumentTree` gained an optional `resolveVar` hook (+ exported `VarResolver` type) that inlines `var(--…)` style values to raw values during extraction — keeps the bridge dependency-light (only `@pyreon/document`).
- `@pyreon/document-primitives`: `extractDocNode({ theme?, mode? })` auto-builds the resolver (composing `resolveModeVar` with unistyle's `resolveCssVarReferences` over a `themeToCssVars(theme)` registry), so PDF/DOCX/email export inlines CSS-variable theme values to raw values. Doc primitives that emit raw literals are unaffected.

Measured/locked in real Chromium; bisect-verified. Flag off (classic path) is byte-identical.

Also: `PyreonUI` now provides the core context via lazy getters instead of an eager object, so reading `.theme` no longer transitively subscribes to the mode signal. Under cssVariables this makes a theme toggle do ZERO per-component re-runs (the cascade handles it) — a real-app 300-component toggle measures ~1.9× faster (~2.05× at 600 components, holds under 4× CPU throttle); classic mode (which reads `.mode`) is unchanged. New `examples/cssvars-bench` + `scripts/bench-cssvars.ts` for the measurement.

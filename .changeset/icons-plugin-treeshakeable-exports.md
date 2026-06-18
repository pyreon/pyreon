---
'@pyreon/zero': minor
---

iconsPlugin: emit tree-shakeable per-icon named exports (inline mode)

The generated `icons.gen.tsx` now exports a per-icon PascalCase component
for every svg — `export const CheckCircle = /*#__PURE__*/ createIcon(...)`
(multi-set: set-namespaced, e.g. `UiArrowLeft`). Import only what you use
(`import { CheckCircle } from './icons.gen'`) and every unused icon — plus
the runtime registry — is dropped from the bundle by standard ESM
dead-code elimination. A typical app declares far more icons than it
renders, so this 100% elimination of unused glyphs is the dominant
bundle-size win.

Additive: the existing `<Icon name="…" />` registry is unchanged and kept
as the deliberate escape hatch for dynamic / data-driven names
(`<Icon name={cmsKey} />`), which can't tree-shake a runtime key. Image-mode
sets are unchanged (registry-only) and their generated output is
byte-identical. New exported helper `componentNameFromIconName`.

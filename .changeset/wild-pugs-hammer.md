---
'@pyreon/primitives': minor
'@pyreon/native-compiler': patch
'@pyreon/runtime-dom': patch
'@pyreon/kinetic': patch
'@pyreon/mcp': patch
---

Ship `<Transition>` / `<TransitionGroup>` from `@pyreon/primitives` — the animation vocabulary now has an import path that resolves on every target

PMTC has lowered `<Transition>` and `<TransitionGroup>` to real platform
animation since M2.7/M2.8 — SwiftUI `.transition(…)` + `.animation(_:value:)`,
Compose `AnimatedVisibility(enter =, exit =)` — with preset mapping, asymmetric
enter/leave timing and device proof. But `@pyreon/primitives` exported neither
name, and the only runtime export lived in `@pyreon/runtime-dom`, which the
compiler correctly flags web-only. So the one import that worked on web warned
on native, and the import native accepted did not exist: a fully built
capability with no reachable door.

`@pyreon/primitives` now exports both, with a self-contained web
implementation built on `h()` + `renderEffect` alone (no `@pyreon/runtime-dom`
dependency — the package keeps its two peer deps, which is what lets it be the
multiplatform vocabulary).

The prop contract mirrors the native emitters exactly: `show`, `name`
(`fade` / `scale-in` / `slide-up|down|left|right`, camelCase and kebab-case
both accepted), `duration`, `easing`, and the asymmetric
`enterDuration` / `leaveDuration` / `enterEasing` / `leaveEasing` overrides that
fall back to the symmetric value. Direction is the direction of travel, so a
slide-up rises into place from below — matching `.move(edge: .bottom)` and
`slideInVertically { it }`.

On web the hidden state is `display:none` on the wrapper rather than an unmount,
so an animation wrapper never gates its children out of SSR and a hidden
`<Transition>` contributes no flex `gap`. Only transition LONGHANDS are ever
assigned, so a consumer's own `transition-delay` survives.

The native emit is unchanged and asserted byte-identical to the bare-tag form.
The web-only warnings for `@pyreon/kinetic` and `@pyreon/runtime-dom` now name
`@pyreon/primitives` as the import that actually crosses, instead of naming a
tag whose only import was broken.

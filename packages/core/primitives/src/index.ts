// @pyreon/primitives — canonical multi-platform UI primitives.
//
// One semantic vocabulary that compiles to DOM (web), SwiftUI (iOS),
// and Compose (Android). Designed for "fundamentally the easiest DX,
// don't copy anyone."
//
// ## How this package works per target
//
// **Web**: imports from this package resolve to the implementations
// in `src/web/`. Each primitive is a `ComponentFn` that renders DOM
// via Pyreon's `h()`. Token resolution is built-in (no styler/theme
// integration in v1 — see plan).
//
// **iOS / Android (via PMTC)**: the Pyreon Multi-Target Compiler
// INTERCEPTS JSX with `<Stack>` / `<Inline>` / etc. at compile time
// and emits platform-native code BEFORE the runtime is reached. The
// imports here are TYPE-ANCHOR only on native targets — they exist
// so the TSX source typechecks; the runtime impls in `src/web/` are
// never invoked.
//
// ## Phase A scope (proof-of-concept)
//
// 6 primitives have real web implementations:
//   - `<Stack>` / `<Inline>` (layout)
//   - `<Text>` (content)
//   - `<Button>` / `<Press>` (interaction)
//   - `<Field>` (input)
//
// 10 more primitives have TYPE definitions but no web runtime yet
// (`<Layer>` / `<Scroll>` / `<Spacer>` / `<Heading>` / `<Image>` /
// `<Icon>` / `<Link>` / `<Toggle>` / `<Modal>`). They ship in
// follow-up PRs as the canonical vocab grows from real-world demand.
// Apps trying to render these on web today get a clear runtime
// error pointing at the missing impl.
//
// ## Phase B scope (PMTC emit)
//
// The compiler-side handling for these primitives lives in
// `packages/native/compiler/src/canonical-primitives.ts` (NEW in
// Phase B). The emit table maps each primitive to its per-target
// platform name + prop translations (`onPress` → `action:` on
// Swift, etc.). Until B1/B2 land, the PMTC compiler falls through
// to its generic-emit pass for these tags, which produces wrong
// output. Don't use `@pyreon/primitives` in PMTC source until
// Phase B ships.
//
// Full architectural spec: `.claude/plans/multiplatform-architecture.md`
// End-user docs: `docs/docs/multiplatform.md`

// ===== Type exports — all 16 canonical primitives =====
export type {
  Align,
  BaseLayoutProps,
  ChildrenProp,
  ColorToken,
  ColorTokens,
  Justify,
  Radius,
  Space,
  ValueOrSignal,
} from './types/shared'

export type { InlineProps, LayerProps, ScrollProps, SpacerProps, StackProps } from './types/layout'
export type { HeadingProps, IconProps, ImageProps, TextProps } from './types/content'
export type { ButtonProps, LinkProps, PressProps } from './types/interaction'
export type { FieldProps, ModalProps, ToggleProps } from './types/input'

// ===== Web runtime exports — 6 proof-of-concept primitives =====
//
// On native targets these imports are intercepted by the PMTC
// compiler before the JSX call site reaches runtime — these
// implementations only run on web.

export { Stack } from './web/Stack'
export { Inline } from './web/Inline'
export { Text } from './web/Text'
export { Button } from './web/Button'
export { Press } from './web/Press'
export { Field } from './web/Field'

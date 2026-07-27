// Canonical multi-platform UI primitives — one semantic vocabulary that
// compiles to DOM (web), SwiftUI (iOS), and Compose (Android).
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
// ## Web runtime scope
//
// ALL 15 canonical primitives have real web implementations:
//   - `<Stack>` / `<Inline>` / `<Layer>` / `<Scroll>` / `<Spacer>` (layout)
//   - `<Text>` / `<Heading>` / `<Image>` / `<Icon>` (content)
//   - `<Button>` / `<Press>` / `<Link>` (interaction)
//   - `<Field>` / `<Toggle>` / `<Modal>` (input)
//
// The web-runtime vocabulary is complete. `<Link>` is router-AGNOSTIC:
// this package has NO router dependency. Internal links render a plain
// `<a href>` and upgrade to SPA navigation only when the app wires a
// handler via `init({ navigate })` (see `./config`); external links are
// a plain `<a target="_blank">`.
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
// End-user docs: `docs/src/content/docs/multiplatform.md`

// ===== Type exports — all 16 canonical primitives =====
export type {
  AccessibilityProps,
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

// ===== Runtime config — one-time app-boot hook (rocketstyle-style) =====
//
// Router-agnostic navigation wiring for `<Link>`. Call `init({ navigate })`
// once at app boot to upgrade internal links to SPA navigation.

export { init, resetPrimitivesConfig } from './config'
export type { PrimitivesInitOptions } from './config'

// ===== Web runtime exports — all 15 canonical primitives =====
//
// On native targets these imports are intercepted by the PMTC
// compiler before the JSX call site reaches runtime — these
// implementations only run on web.

export { Stack } from './web/Stack'
export { Inline } from './web/Inline'
export { Layer } from './web/Layer'
export { Scroll } from './web/Scroll'
export { Spacer } from './web/Spacer'
export { Text } from './web/Text'
export { Heading } from './web/Heading'
export { Image } from './web/Image'
export { Icon } from './web/Icon'
export { Button } from './web/Button'
export { Press } from './web/Press'
export { Link } from './web/Link'
export { Field } from './web/Field'
export { Toggle } from './web/Toggle'
export { Modal } from './web/Modal'
// Escape-hatch primitives (Layer 4) — per-platform branch selection. On
// web, `<Web>` renders its children and `<NativeIOS>`/`<NativeAndroid>`
// render nothing; PMTC mirrors this per native target (iOS renders the
// `<NativeIOS>` branch, Android the `<NativeAndroid>` branch).
export { Web, NativeIOS, NativeAndroid } from './web/escape-hatch'
export type { EscapeHatchProps } from './types/escape-hatch'
// `<WebView>` — native host (WKWebView / Android WebView) for embedding
// web content; an `<iframe>` on web. The path to using web-only-rich viz
// (charts / flow / tables) inside a native shell.
export { WebView } from './web/WebView'
export type { WebViewProps } from './types/webview'

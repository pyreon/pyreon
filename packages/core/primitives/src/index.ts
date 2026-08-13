// Canonical multi-platform UI primitives — one semantic vocabulary that compiles
// to DOM (web), SwiftUI (iOS) and Compose (Android).
//
// Per target: on WEB these resolve to the real `ComponentFn` implementations in
// `src/web/`, which render DOM via `h()` with token resolution built in. On
// iOS/Android the PMTC compiler INTERCEPTS the JSX and emits platform-native
// code before the runtime is reached, so the imports are TYPE-ANCHOR ONLY there
// — they exist so the TSX typechecks; `src/web/` is never invoked.
//
// The per-target emit table (platform names + prop translations such as
// `onPress` -> Swift `action:`) lives in
// `packages/native/compiler/src/canonical-primitives.ts`.
//
// `<Link>` is router-AGNOSTIC — this package has NO router dependency. Internal
// links render a plain `<a href>` and upgrade to SPA navigation only when the
// app wires a handler via `init({ navigate })` (see `./config`); external links
// stay a plain `<a target="_blank">`.
//
// Architecture: `.claude/plans/multiplatform-architecture.md`
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
export type { AudioProps, HeadingProps, IconProps, ImageProps, TextProps, VideoProps } from './types/content'
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
export { Audio } from './web/Audio'
export { Video } from './web/Video'
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
// Guest-side glue for the WebView bridge — the reusable other half of the
// WebView-host pattern. A web-only-rich component built as a self-contained
// bundle runs `connectWebHost()` INSIDE the hosted page to read host-pushed
// props (`data()`/`onData`) and send events back (`emit`) on every platform.
export { connectWebHost, webHostDocument } from './web-host-bridge'
export type { WebHostConnection, WebHostDocumentOptions } from './web-host-bridge'
// User-defined native modules (Layer 4) — the FFI escape hatch. The
// canonical primitives + built-in service hooks are a fixed set; this is
// how an APP adds a platform capability the framework does not ship
// (Bluetooth, AR, a vendor SDK) without a framework change. PMTC lowers
// `useNativeModule('X')` to an instance of the app's own Swift/Kotlin
// class; on web it resolves the `defineNativeModule` registration.
export {
  defineNativeModule,
  useNativeModule,
  hasNativeModule,
  _resetNativeModules,
} from './native-module'
export type { NativeModuleShape } from './native-module'

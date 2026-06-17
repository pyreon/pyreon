// Web implementations of the escape-hatch primitives — `<Web>`,
// `<NativeIOS>`, `<NativeAndroid>`.
//
// These are the Layer-4 per-platform escape hatch: one source carries a
// platform-specific subtree, and exactly ONE branch renders per target.
//
// Compiles to:
// - **Web** (these impls): `<Web>` renders its children; `<NativeIOS>` /
//   `<NativeAndroid>` render NOTHING (their content is for the native
//   targets only).
// - **iOS** (via PMTC): `<NativeIOS>` emits its children; `<Web>` /
//   `<NativeAndroid>` emit `EmptyView()`.
// - **Android** (via PMTC): `<NativeAndroid>` emits its children; `<Web>` /
//   `<NativeIOS>` emit a no-op.
//
// Canonical use — a heavy-viz screen that's web-only-rich (charts/flow/
// tables) on web and a native equivalent (or a `<WebView>` embed, a
// future primitive) on native:
//
//   <Web><Chart instance={c} /></Web>
//   <NativeIOS>{/* Swift Charts / a <WebView> embed */}</NativeIOS>
//   <NativeAndroid>{/* Compose chart / a <WebView> embed */}</NativeAndroid>

import { h, Fragment } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import type { EscapeHatchProps } from '../types/escape-hatch'

/**
 * `<Web>` — renders its children on the web target only. On iOS/Android
 * (via PMTC) the web branch is dropped, so this content never reaches
 * native. Layout-transparent: renders children via a Fragment, no
 * wrapper element.
 */
export function Web(props: EscapeHatchProps): VNodeChild {
  return h(Fragment, null, props.children)
}

/**
 * `<NativeIOS>` — renders NOTHING on web (its children are the iOS branch,
 * emitted by PMTC on the Swift target). A no-op on web by design.
 */
export function NativeIOS(_props: EscapeHatchProps): VNodeChild {
  return null
}

/**
 * `<NativeAndroid>` — renders NOTHING on web (its children are the Android
 * branch, emitted by PMTC on the Kotlin target). A no-op on web by design.
 */
export function NativeAndroid(_props: EscapeHatchProps): VNodeChild {
  return null
}

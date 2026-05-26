// Shared types across the canonical primitive vocabulary.
//
// These types define the cross-platform contract — each platform's
// implementation (web in runtime-dom; iOS/Android via PMTC emit)
// honors the same TypeScript surface.

import type { VNodeChild } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'

/**
 * Canonical accept-either type for value props. Either a plain
 * value OR a Signal — primitives unwrap signals internally so users
 * can pass either shape interchangeably. Same pattern Pyreon's
 * `<Show when={...}>` accepts.
 */
export type ValueOrSignal<T> = T | Signal<T> | (() => T)

/**
 * Theme-tokenized spacing scale. Use the integer index into
 * `theme.space` (0–9) or the semantic name (`"sm"|"md"|"lg"`).
 * Web resolves to inline `style` px; iOS/Android resolve via
 * platform spacing modifiers.
 */
export type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/**
 * Theme-tokenized color name. Defines the semantic color slot rather
 * than a hex/rgb value. Per-platform theme resolves to actual color.
 *
 * Extensible via TS module augmentation — apps that ship a custom
 * theme can extend `ColorToken` with their own slot names.
 */
export interface ColorTokens {
  text: true
  surface: true
  primary: true
  secondary: true
  success: true
  warning: true
  danger: true
  muted: true
}
export type ColorToken = keyof ColorTokens

/**
 * Theme-tokenized border-radius scale.
 */
export type Radius = 'none' | 'sm' | 'md' | 'lg' | 'full'

/**
 * Cross-axis alignment (flex `alignItems`). `<Stack direction="column">`
 * uses this for the horizontal alignment of children; `<Stack direction="row">`
 * uses it for vertical.
 */
export type Align = 'start' | 'center' | 'end' | 'stretch'

/**
 * Main-axis distribution (flex `justifyContent`).
 */
export type Justify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'

/**
 * Style props that every layout primitive accepts. Tokens-first —
 * raw pixel values are intentionally NOT accepted at this layer
 * (use `<Web style={{ padding: 17 }}>` escape hatch for one-off
 * non-token values).
 *
 * v1 scope: NO responsive props (web has media queries, iOS has
 * size classes, Android has configuration changes — unifying them
 * is a multi-week design problem deferred to a future arc).
 * Apps that need responsive web use `@pyreon/elements` directly.
 */
export interface BaseLayoutProps {
  padding?: Space
  paddingX?: Space
  paddingY?: Space
  margin?: Space
  marginX?: Space
  marginY?: Space
  background?: ColorToken
  radius?: Radius
}

/**
 * Children accepting. Same shape Pyreon's existing components use.
 */
export interface ChildrenProp {
  children?: VNodeChild
}

/**
 * Standard HTML pass-through attrs every primitive accepts. The web
 * impls forward these to the rendered DOM node verbatim; native
 * targets ignore them at PMTC emit time (the iOS/Android compilers
 * accept the type-level keys but don't propagate `data-*` to SwiftUI
 * / Compose — those platforms have their own a11y / testing IDs).
 *
 * **Why this layer exists**: real apps need `data-testid` for e2e
 * tests, `aria-*` for accessibility, `id` for label/for hookups,
 * and `class` for shadow-DOM / styling escape hatches. Without
 * passthrough, every primitive's render fn would need an explicit
 * prop for each — primitive vocabulary becomes a HTML re-spec.
 * The passthrough keeps the canonical surface minimal AND lets real
 * apps use standard HTML hooks unmodified.
 *
 * Phase D2's e2e gate (PR #951) is the consumer that surfaced this
 * gap; the gate's `data-testid="todo-app"` was silently dropped by
 * the previous primitive impls.
 */
export interface HtmlPassthroughProps {
  // Mapped key types make TS accept ANY `data-`/`aria-`-prefixed key
  // without needing each one enumerated. Values match the HTML
  // attribute model (string | number | boolean | undefined).
  [key: `data-${string}`]: string | number | boolean | undefined
  [key: `aria-${string}`]: string | number | boolean | undefined
  id?: string
  /** Standard HTML class. Use `cx(...)` from `@pyreon/core` to compose. */
  class?: string
  /** Inline style override — merged AFTER the primitive's computed style
   * so consumer overrides win. Tokens-first APIs (padding, gap, etc.) are
   * the preferred path; `style` is the escape hatch for one-off CSS. */
  style?: string | Record<string, string>
}

// Animation primitive type definitions — Transition / TransitionGroup.
//
// This is the CROSS-PLATFORM animation vocabulary. The PMTC compiler has
// lowered `<Transition>` / `<TransitionGroup>` to real platform animation
// since M2.7/M2.8 (SwiftUI `.transition(...)` + `.animation(_:value:)`;
// Compose `AnimatedVisibility(enter =, exit =)`), but the names were only
// exported from `@pyreon/runtime-dom` — a package PMTC correctly flags
// WEB-ONLY. So the one import that made the emit reachable warned on
// native, and the import that native accepted did not exist on web.
// These types + the `../web/` implementations beside them close that.
//
// The prop surface here MIRRORS the native emitters exactly
// (`packages/native/compiler/src/emit-{swift,kotlin}.ts`). Do not add a
// prop the emitters do not read — a web-only prop on a multiplatform
// primitive is the same phantom-capability shape in reverse.

import type { ChildrenProp, HtmlPassthroughProps, ValueOrSignal } from './shared'

/**
 * The `<Transition name>` preset vocabulary — the set with a real
 * translation on every target.
 *
 * BOTH spellings are accepted, because the two live conventions disagree:
 * `@pyreon/kinetic` names its presets in camelCase (`slideUp`) while the
 * CSS-class convention on the web is kebab-case (`slide-up`). The native
 * emitters normalize by lower-casing and stripping `-`/`_`
 * (`normalizePresetName` in `@pyreon/native-compiler`), and the web impl
 * uses the identical normalization — so any spelling that lowers natively
 * renders identically on web.
 *
 * The union is CLOSED on purpose. Natively an unrecognized name warns and
 * falls back to a fade; typing it closed turns that into a build error at
 * the call site instead, and every name that typechecks is one all three
 * targets translate.
 *
 * Direction is the direction of TRAVEL: `slideUp` rises INTO place, so it
 * enters from the bottom edge (SwiftUI `.move(edge: .bottom)`, Compose
 * `slideInVertically { it }`, web `translateY(100%) -> 0`).
 */
export type TransitionPreset =
  | 'fade'
  | 'scale'
  | 'scaleIn'
  | 'scale-in'
  | 'slideUp'
  | 'slide-up'
  | 'slideDown'
  | 'slide-down'
  | 'slideLeft'
  | 'slide-left'
  | 'slideRight'
  | 'slide-right'

/**
 * Timing function. The four CSS names map onto each platform's canonical
 * curves: `ease-in` → SwiftUI `.easeIn` / Compose `FastOutLinearInEasing`,
 * `ease-out` → `.easeOut` / `LinearOutSlowInEasing`, `ease-in-out` →
 * `.easeInOut` / `FastOutSlowInEasing` (also the default), `linear` →
 * `.linear` / `LinearEasing`.
 */
export type TransitionEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

/**
 * `<Transition>` — animate a subtree in and out of view.
 *
 * Per-platform mapping:
 * - Web: a wrapper `<div>` whose `opacity`/`transform` are driven by real
 *   CSS transitions (longhands only — assigning the `transition` SHORTHAND
 *   would clobber a consumer's `transition-delay`)
 * - iOS: `ZStack { if show { Group { … }.transition(…) } }.animation(…, value: show)`
 * - Android: `AnimatedVisibility(visible = show, enter = …, exit = …)`
 *
 * `duration` must be a static number of milliseconds on native (the
 * emitters read it as a literal and warn otherwise), so keep it a literal
 * rather than a signal read.
 */
export interface TransitionProps extends ChildrenProp, HtmlPassthroughProps {
  /** Whether the content is shown. Accepts a plain boolean, a signal, or an accessor. */
  show: ValueOrSignal<boolean>
  /** Preset animation. Defaults to `fade`. */
  name?: TransitionPreset
  /** Symmetric duration in milliseconds. Defaults to 300. Must be a static literal. */
  duration?: number
  /** Symmetric timing function. Defaults to `ease-in-out`. */
  easing?: TransitionEasing
  /** Enter-side duration override; falls back to `duration`. Must be a static literal. */
  enterDuration?: number
  /** Leave-side duration override; falls back to `duration`. Must be a static literal. */
  leaveDuration?: number
  /** Enter-side timing override; falls back to `easing`. */
  enterEasing?: TransitionEasing
  /** Leave-side timing override; falls back to `easing`. */
  leaveEasing?: TransitionEasing
}

/**
 * `<TransitionGroup>` — a container that animates its own size as its
 * content changes (rows added to or removed from a keyed list).
 *
 * Per-platform mapping:
 * - Web: a wrapper `<div>` whose height is measured (`ResizeObserver`) and
 *   transitioned
 * - iOS: `VStack { … }.animation(.default, value: <list>.count)`
 * - Android: `Column(modifier = Modifier.animateContentSize())`
 *
 * Deliberately children-only: the native emitters read no other attribute,
 * so a `duration`/`easing` prop here would be web-only decoration on a
 * primitive whose whole purpose is parity.
 */
export type TransitionGroupProps = ChildrenProp & HtmlPassthroughProps

// Vector-drawing primitive type definitions — `<Canvas>` and its shapes.

import type { ChildrenProp, ColorToken, HtmlPassthroughProps } from './shared'

/**
 * A shape colour: a theme token (`'primary'`) or a `#rgb` / `#rrggbb` /
 * `#rrggbbaa` hex literal. Tokens resolve per target exactly as on the other
 * primitives; hex is passed through on the web and converted on native.
 */
export type ShapeColor = ColorToken | `#${string}`

/**
 * Paint shared by the filled shapes. With neither `fill` nor `stroke`, a shape
 * is filled with the `text` colour on every target (an SVG would default to
 * black and a native path to nothing — this is the agreed middle).
 */
export interface ShapePaintProps {
  fill?: ShapeColor
  stroke?: ShapeColor
  /** Stroke width in px / pt / dp. Default `1` when `stroke` is set. */
  strokeWidth?: number
}

/**
 * `<Canvas>` — a fixed-size drawing surface. Children are the shape
 * primitives (`CanvasRect`, `CanvasCircle`, `CanvasLine`, `CanvasPath`,
 * `CanvasText`), drawn in source order (later on top) in the canvas's own
 * coordinates: `(0, 0)` is the top-left corner, y points down, units are px
 * (web) / pt (iOS) / dp (Android). Content outside the canvas is clipped.
 *
 * Shapes are ordinary JSX children, so `<For>`, `<Show>` and signal-driven
 * props work inside a canvas the same way they do anywhere else.
 *
 * Per-platform mapping:
 * - Web: a `position: relative` box; each shape is an absolutely positioned
 *   `<svg>` layer, so shapes and other children can mix
 * - iOS: `PyreonCanvas(width:height:) { … }` — a top-leading `ZStack` of
 *   SwiftUI `Path`s, `.clipped()`
 * - Android: `PyreonCanvas(width, height) { … }` — a clipped `Box` of
 *   Compose `Canvas` draw layers
 *
 * @example
 * ```tsx
 * <Canvas width={200} height={120} background="surface">
 *   <CanvasRect x={10} y={10} width={80} height={50} radius={6} fill="primary" />
 *   <CanvasPath d="M10 100 L190 100" stroke="text" strokeWidth={2} />
 *   <CanvasText x={110} y={20} size={14}>Hall A</CanvasText>
 * </Canvas>
 * ```
 */
export interface CanvasProps extends ChildrenProp, HtmlPassthroughProps {
  width: number
  height: number
  background?: ColorToken
}

/** A rectangle, optionally with rounded corners. */
export interface CanvasRectProps extends ShapePaintProps {
  x: number
  y: number
  width: number
  height: number
  /** Corner radius. Default `0`. */
  radius?: number
}

/** A circle centred at (`cx`, `cy`). */
export interface CanvasCircleProps extends ShapePaintProps {
  cx: number
  cy: number
  r: number
}

/** A straight line. Stroked with the `text` colour when `stroke` is absent. */
export interface CanvasLineProps {
  x1: number
  y1: number
  x2: number
  y2: number
  stroke?: ShapeColor
  strokeWidth?: number
}

/**
 * A path in SVG path-data syntax (`M10 10 L200 10 Z`). Every command is
 * supported, absolute and relative: M L H V C S Q T A Z.
 */
export interface CanvasPathProps extends ShapePaintProps {
  d: string
}

/**
 * Text drawn at (`x`, `y`) — the TOP-LEFT of the text, not the baseline
 * (SVG's `dominant-baseline="hanging"`), so the same numbers place it the same
 * way on every target.
 */
export interface CanvasTextProps extends ChildrenProp {
  x: number
  y: number
  /** Font size in px / pt / sp. Default `14`. */
  size?: number
  fill?: ShapeColor
}

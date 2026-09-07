// Backend-neutral chart geometry + draw-command types.
//
// Everything here is PURE DATA and pure functions over it — no DOM, no canvas,
// no platform API. That is deliberate and load-bearing: this layer is the one
// that has to compile to SwiftUI and Compose through PMTC, which compiles your
// source rather than your dependencies. The platform-specific half is only the
// executor that walks a `DrawCmd[]` and calls the host's drawing API.
//
// Numbers are written as `Double` rather than `number` throughout. PMTC types a
// bare `number` as Int (its ergonomic default for counts and indices) and a
// chart is float arithmetic in every line, so the annotation is what keeps the
// emitted Swift/Kotlin correct.

/**
 * A floating-point number.
 *
 * An alias for `number`, and load-bearing on native. PMTC types a bare
 * `number` as `Int` — its ergonomic default for counts, ids and indices — and
 * chart geometry is float arithmetic in every line, so a bare `number` emits
 * Swift/Kotlin that does integer division and truncates every ratio.
 *
 * Writing the alias rather than the bare word `Double` is what keeps
 * TypeScript happy too: `Double` is not a TS type, so annotating with it
 * directly fails `tsc` while satisfying only the native compiler. The alias
 * satisfies both — `tsc` resolves it to `number`, and PMTC reads the
 * annotation's NAME and emits `Double`.
 */
export type Double = number

/** A point in plot pixels, origin top-left. */
export interface Pt {
  x: Double
  y: Double
}

/** An axis-aligned rectangle in plot pixels. */
export interface Rect {
  x: Double
  y: Double
  w: Double
  h: Double
}

/** One axis tick: its domain value, its pixel position, and its label. */
export interface Tick {
  value: Double
  pos: Double
  label: string
}

/** An inclusive numeric domain. `min === max` is legal (a flat series). */
export interface Domain {
  min: Double
  max: Double
}

/**
 * Text measurement, supplied by the host.
 *
 * Axis layout needs label widths BEFORE it can decide gutter sizes, and only
 * the platform knows its own font metrics — so measurement is an input to the
 * engine, not something the engine can compute. Every backend can answer it:
 * the web from a canvas 2D context, iOS from `ctx.resolve(Text(…)).measure`,
 * Android from `TextMeasurer`.
 */
export type MeasureText = (text: string, fontSize: Double) => Double

/**
 * One drawing instruction. A chart renders to a flat list of these, which each
 * backend executes against its own surface.
 *
 * A flat command list rather than a retained scene graph, because the list is
 * what crosses cheaply: it is plain data with no closures, so it survives both
 * the PMTC compile and any serialization boundary a host wants to put in.
 */
/** One colour along a gradient's axis — `offset` is 0..1 from `from` to `to`. */
export interface ChartGradientStop {
  offset: Double
  color: string
}

/**
 * A linear gradient in the shape's own coordinate space.
 *
 * Named `ChartGradient` rather than `Gradient` on purpose: SwiftUI already has
 * a `Gradient`, and the generated engine lands in the same module as the
 * runtime canvas.
 *
 * Every command that can carry one ALSO carries its solid `fill`. A backend
 * that cannot paint a gradient — or a caller serializing one command at a time
 * without a `<defs>` to put it in — falls back to the fill rather than to
 * nothing.
 */
export interface ChartGradient {
  from: Pt
  to: Pt
  stops: ChartGradientStop[]
}

export type DrawCmd =
  | {
      kind: 'rect'
      rect: Rect
      fill: string
      /**
       * Corner radii — `[topLeft, topRight, bottomRight, bottomLeft]`, in the
       * same units as the rect. Absent (the common case) is a square rect and
       * serializes byte-identically to before.
       *
       * Every executor clamps through the engine's own `cornerRadii`, so the
       * web canvas, the SVG string and the SwiftUI/Compose canvases round by
       * the same numbers rather than by four platform conventions.
       */
      corners?: Double[] | undefined
      /** Paint the fill as a gradient; `fill` stays the fallback. */
      grad?: ChartGradient | undefined
    }
  | { kind: 'line'; from: Pt; to: Pt; stroke: string; width: Double; dash?: Double[] | undefined }
  | { kind: 'polyline'; points: Pt[]; stroke: string; width: Double; dash?: Double[] | undefined }
  | { kind: 'polygon'; points: Pt[]; fill: string; grad?: ChartGradient | undefined }
  | { kind: 'circle'; center: Pt; radius: Double; fill: string }
  | {
      kind: 'text'
      text: string
      at: Pt
      fill: string
      size: Double
      /** Horizontal anchor — the label sits left of, centred on, or right of `at.x`. */
      align: 'start' | 'middle' | 'end'
      /** Vertical anchor, same idea. */
      baseline: 'top' | 'middle' | 'bottom'
    }

/**
 * Edge MARKERS — arrowhead resolution and `<defs>` deduplication.
 *
 * Split out of `edges.ts` so that file is pure GEOMETRY. The reason is not
 * tidiness: the geometry is compiled to Swift and Kotlin by PMTC, and these
 * four helpers are the only things in the file that cannot cross — they reach
 * for `typeof`, a regex, the `in` operator and a `Map` with a non-scalar value,
 * which is four of PMTC's unsupported constructs in seventy lines. They are
 * also genuinely web-only work: an SVG `<defs>` id has no native analogue.
 *
 * Keeping them here means the crossing bundle is a WHOLE FILE rather than a
 * filtered one, which is what makes a generator's output reviewable.
 */
import type { EdgeMarker, EdgeMarkerSpec, FlowEdge } from './types'
import { MarkerType } from './types'

// ─── Edge markers ──────────────────────────────────────────────────────────
//
// React Flow parity: per-edge configurable arrowheads, deduplicated into one
// `<defs>` block. These helpers are pure + exported so they can be unit-tested
// without mounting a flow.

// Default marker colour = the SAME themeable var the edge stroke uses, so an
// unstyled arrowhead matches its line (a natural line→arrow→box connection)
// and re-themes with it. `MarkerGlyph` sets it via `style` (a `var()` is invalid
// in an SVG presentation attribute); `markerId` sanitizes it to a stable dedup
// token distinct from an explicit `#999`, so the two never collapse to one def.
const DEFAULT_MARKER_COLOR = 'var(--pyreon-flow-edge, #999)'
const DEFAULT_MARKER_W = 10
const DEFAULT_MARKER_H = 7
const DEFAULT_MARKER_STROKE = 1

/** The historical built-in arrowhead — the default when no marker is specified. */
export const DEFAULT_MARKER_END: EdgeMarker = { type: MarkerType.ArrowClosed }

/** Normalize a marker spec (bare `MarkerType`, full object, or null) to a
 *  fully-resolved {@link EdgeMarker} with defaults applied, or `null` for none. */
export function resolveMarker(spec: EdgeMarkerSpec | null | undefined): EdgeMarker | null {
  if (spec == null) return null
  const m = typeof spec === 'string' ? { type: spec } : spec
  return {
    type: m.type,
    color: m.color ?? DEFAULT_MARKER_COLOR,
    width: m.width ?? DEFAULT_MARKER_W,
    height: m.height ?? DEFAULT_MARKER_H,
    strokeWidth: m.strokeWidth ?? DEFAULT_MARKER_STROKE,
  }
}

/** Deterministic, DOM-id-safe key for a resolved marker — identical configs
 *  collapse to one `<marker>` def. Color is sanitized to `[a-z0-9]`. */
export function markerId(m: EdgeMarker): string {
  const color = (m.color ?? DEFAULT_MARKER_COLOR).toLowerCase().replace(/[^a-z0-9]/g, '')
  return `pyreon-flow-marker-${m.type}-${color}-${m.width}x${m.height}-${m.strokeWidth}`
}

/** Resolve an edge's start/end markers, applying the flow-level default end. */
export function resolveEdgeMarkers(
  edge: FlowEdge,
  defaultMarkerEnd: EdgeMarkerSpec | null | undefined,
): { start: EdgeMarker | null, end: EdgeMarker | null } {
  // `markerEnd` absent → flow default; `markerEnd: null` → explicitly none.
  const endSpec = 'markerEnd' in edge ? edge.markerEnd : defaultMarkerEnd
  return { start: resolveMarker(edge.markerStart), end: resolveMarker(endSpec) }
}

/** Collect every distinct marker across all edges into an id→marker map, so the
 *  `<defs>` block renders each unique config exactly once. */
export function collectEdgeMarkers(
  edges: readonly FlowEdge[],
  defaultMarkerEnd: EdgeMarkerSpec | null | undefined,
): Map<string, EdgeMarker> {
  const out = new Map<string, EdgeMarker>()
  for (const edge of edges) {
    const { start, end } = resolveEdgeMarkers(edge, defaultMarkerEnd)
    if (start) out.set(markerId(start), start)
    if (end) out.set(markerId(end), end)
  }
  return out
}

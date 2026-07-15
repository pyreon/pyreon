/**
 * Edge-marker helpers — React Flow parity for configurable arrowheads.
 *
 * Covers the pure marker pipeline: normalize a spec (bare `MarkerType`, full
 * `EdgeMarker`, or null) → defaults; deterministic dedup id; per-edge start/end
 * resolution with the flow-level default; and collecting the distinct `<defs>`
 * set across all edges. The render side (real `<marker>` DOM + per-edge
 * `marker-start`/`marker-end` refs) is covered in `flow.browser.test.tsx`.
 */
import { describe, expect, it } from 'vitest'
import {
  collectEdgeMarkers,
  DEFAULT_MARKER_END,
  markerId,
  resolveEdgeMarkers,
  resolveMarker,
} from '../edges'
import type { FlowEdge } from '../types'
import { MarkerType } from '../types'

describe('resolveMarker', () => {
  it('normalizes a bare MarkerType to a fully-defaulted marker', () => {
    expect(resolveMarker(MarkerType.Arrow)).toEqual({
      // Default colour is the themeable edge var so an unstyled arrowhead
      // matches its line (see DEFAULT_MARKER_COLOR).
      type: 'arrow',
      color: 'var(--pyreon-flow-edge, #999)',
      width: 10,
      height: 7,
      strokeWidth: 1,
    })
  })

  it('fills defaults on a partial EdgeMarker, keeping provided fields', () => {
    expect(resolveMarker({ type: MarkerType.ArrowClosed, color: '#f00', width: 20 })).toEqual({
      type: 'arrowclosed',
      color: '#f00',
      width: 20,
      height: 7,
      strokeWidth: 1,
    })
  })

  it('returns null for null/undefined (explicit "no marker")', () => {
    expect(resolveMarker(null)).toBeNull()
    expect(resolveMarker(undefined)).toBeNull()
  })
})

describe('markerId', () => {
  it('is deterministic and config-keyed — identical configs share an id', () => {
    const a = resolveMarker(MarkerType.Arrow)!
    const b = resolveMarker(MarkerType.Arrow)! // same defaults → same id
    expect(markerId(a)).toBe(markerId(b))
  })

  it('an explicit colour that equals the fallback does NOT collide with the var default', () => {
    // Default → `var(--pyreon-flow-edge, #999)`; explicit `#999` is a different
    // colour (a fixed grey, not the themeable var), so the ids must differ or
    // one <marker> def would wrongly serve both.
    const def = resolveMarker(MarkerType.Arrow)!
    const explicit = resolveMarker({ type: MarkerType.Arrow, color: '#999' })!
    expect(markerId(def)).not.toBe(markerId(explicit))
  })

  it('differs by type, color, and size', () => {
    const closed = resolveMarker(MarkerType.ArrowClosed)!
    const open = resolveMarker(MarkerType.Arrow)!
    const red = resolveMarker({ type: MarkerType.Arrow, color: '#f00' })!
    const big = resolveMarker({ type: MarkerType.Arrow, width: 30 })!
    const ids = new Set([markerId(closed), markerId(open), markerId(red), markerId(big)])
    expect(ids.size).toBe(4)
  })

  it('produces a DOM-id-safe string (color sanitized to [a-z0-9])', () => {
    const m = resolveMarker({ type: MarkerType.ArrowClosed, color: 'rgb(255, 0, 0)' })!
    expect(markerId(m)).toMatch(/^pyreon-flow-marker-arrowclosed-[a-z0-9]+-10x7-1$/)
  })
})

describe('resolveEdgeMarkers', () => {
  const edge = (over: Partial<FlowEdge>): FlowEdge => ({ source: 'a', target: 'b', ...over })

  it('absent markerEnd falls back to the flow default', () => {
    const { end } = resolveEdgeMarkers(edge({}), DEFAULT_MARKER_END)
    expect(end?.type).toBe('arrowclosed')
  })

  it('markerEnd: null explicitly removes the end marker (overrides the default)', () => {
    const { end } = resolveEdgeMarkers(edge({ markerEnd: null }), DEFAULT_MARKER_END)
    expect(end).toBeNull()
  })

  it('explicit markerEnd wins over the default', () => {
    const { end } = resolveEdgeMarkers(edge({ markerEnd: MarkerType.Arrow }), DEFAULT_MARKER_END)
    expect(end?.type).toBe('arrow')
  })

  it('markerStart resolves (and is absent by default)', () => {
    expect(resolveEdgeMarkers(edge({}), DEFAULT_MARKER_END).start).toBeNull()
    expect(
      resolveEdgeMarkers(edge({ markerStart: MarkerType.ArrowClosed }), DEFAULT_MARKER_END).start
        ?.type,
    ).toBe('arrowclosed')
  })

  it('a null flow default makes edges arrowless unless they opt in', () => {
    expect(resolveEdgeMarkers(edge({}), null).end).toBeNull()
    expect(resolveEdgeMarkers(edge({ markerEnd: MarkerType.Arrow }), null).end?.type).toBe('arrow')
  })
})

describe('collectEdgeMarkers', () => {
  it('dedupes identical markers and collects both ends across edges', () => {
    const edges: FlowEdge[] = [
      { source: 'a', target: 'b' }, // default end
      { source: 'b', target: 'c' }, // default end (same → deduped)
      { source: 'c', target: 'd', markerStart: MarkerType.Arrow, markerEnd: { type: MarkerType.Arrow, color: '#f00' } },
    ]
    const defs = collectEdgeMarkers(edges, DEFAULT_MARKER_END)
    // arrowclosed/var (default end, deduped from 2 edges), arrow/var (default
    // start), arrow/#f00 (explicit end) = 3
    expect(defs.size).toBe(3)
    const types = [...defs.values()].map((m) => `${m.type}-${m.color}`).sort()
    expect(types).toEqual([
      'arrow-#f00',
      'arrow-var(--pyreon-flow-edge, #999)',
      'arrowclosed-var(--pyreon-flow-edge, #999)',
    ])
  })

  it('emits nothing when every edge is arrowless', () => {
    const edges: FlowEdge[] = [
      { source: 'a', target: 'b', markerEnd: null },
      { source: 'b', target: 'c', markerEnd: null },
    ]
    expect(collectEdgeMarkers(edges, DEFAULT_MARKER_END).size).toBe(0)
  })
})

/**
 * `EdgePathResult.segments` — a differential oracle against the SVG `path`
 * string every builder ALSO still produces. The two representations are
 * built from the same local variables at each call site (see `edges.ts`),
 * but nothing enforces that by construction — this test is what would catch
 * the day one drifts from the other.
 *
 * The oracle PARSES `path` independently (a tiny `M`/`L`/`C`/`Q` reader) and
 * asserts it reconstructs the SAME points `segments` carries. A parser bug
 * here would have to agree with a builder bug in exactly the wrong way to
 * pass — the cheapest strong check available without a second geometry
 * implementation.
 */
import { describe, expect, it } from 'vitest'
import {
  getBezierPath,
  getSmoothStepPath,
  getStepPath,
  getStraightPath,
  getWaypointPath,
} from '../edges'
import type { EdgePathResult, EdgeSegment } from '../types'
import { Position } from '../types'

/** Independent reader: turns an SVG `d` string of only M/L/C/Q commands
 *  back into the same `EdgeSegment[]` shape `edges.ts` builds directly. */
function parsePathToSegments(d: string): EdgeSegment[] {
  const segments: EdgeSegment[] = []
  // Each command is `<letter><numbers separated by spaces/commas>`.
  const commands = d.match(/[MLCQ][^MLCQ]*/g) ?? []
  for (const cmd of commands) {
    const letter = cmd[0] as 'M' | 'L' | 'C' | 'Q'
    const nums = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    if (letter === 'M') segments.push({ kind: 'move', x: nums[0]!, y: nums[1]! })
    else if (letter === 'L') segments.push({ kind: 'line', x: nums[0]!, y: nums[1]! })
    else if (letter === 'C') {
      segments.push({
        kind: 'cubic',
        c1x: nums[0]!,
        c1y: nums[1]!,
        c2x: nums[2]!,
        c2y: nums[3]!,
        x: nums[4]!,
        y: nums[5]!,
      })
    } else if (letter === 'Q') {
      segments.push({ kind: 'quad', cx: nums[0]!, cy: nums[1]!, x: nums[2]!, y: nums[3]! })
    }
  }
  return segments
}

function assertSegmentsMatchPath(result: EdgePathResult): void {
  expect(result.segments).toEqual(parsePathToSegments(result.path))
}

describe('edge segments — agree with the SVG path string (differential)', () => {
  it('bezier — default positions', () => {
    assertSegmentsMatchPath(
      getBezierPath({ sourceX: 0, sourceY: 0, targetX: 200, targetY: 100 }),
    )
  })

  it('bezier — Left source, Right target, custom curvature', () => {
    assertSegmentsMatchPath(
      getBezierPath({
        sourceX: 10,
        sourceY: 20,
        sourcePosition: Position.Left,
        targetX: 300,
        targetY: 250,
        targetPosition: Position.Right,
        curvature: 0.6,
      }),
    )
  })

  it('straight', () => {
    assertSegmentsMatchPath(getStraightPath({ sourceX: 5, sourceY: 5, targetX: 90, targetY: 40 }))
  })

  it('smoothstep — horizontal source, vertical target', () => {
    assertSegmentsMatchPath(
      getSmoothStepPath({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Right,
        targetX: 150,
        targetY: 120,
        targetPosition: Position.Top,
      }),
    )
  })

  it('smoothstep — vertical source, horizontal target', () => {
    assertSegmentsMatchPath(
      getSmoothStepPath({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Bottom,
        targetX: 150,
        targetY: 120,
        targetPosition: Position.Left,
      }),
    )
  })

  it('smoothstep — both horizontal', () => {
    assertSegmentsMatchPath(
      getSmoothStepPath({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Right,
        targetX: 200,
        targetY: 80,
        targetPosition: Position.Left,
      }),
    )
  })

  it('smoothstep — both vertical', () => {
    assertSegmentsMatchPath(
      getSmoothStepPath({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Bottom,
        targetX: 40,
        targetY: 200,
        targetPosition: Position.Top,
      }),
    )
  })

  it('smoothstep — borderRadius 0 collapses to sharp corners (still a Q, radius zero)', () => {
    assertSegmentsMatchPath(
      getSmoothStepPath({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Right,
        targetX: 150,
        targetY: 120,
        targetPosition: Position.Top,
        borderRadius: 0,
      }),
    )
  })

  it('step — delegates to smoothstep(borderRadius: 0)', () => {
    assertSegmentsMatchPath(
      getStepPath({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Right,
        targetX: 150,
        targetY: 120,
        targetPosition: Position.Top,
      }),
    )
  })

  it('waypoint — no waypoints (straight fallback)', () => {
    assertSegmentsMatchPath(
      getWaypointPath({ sourceX: 0, sourceY: 0, targetX: 100, targetY: 50, waypoints: [] }),
    )
  })

  it('waypoint — one waypoint', () => {
    assertSegmentsMatchPath(
      getWaypointPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 100,
        targetY: 50,
        waypoints: [{ x: 50, y: 10 }],
      }),
    )
  })

  it('waypoint — several waypoints', () => {
    assertSegmentsMatchPath(
      getWaypointPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 300,
        targetY: 150,
        waypoints: [
          { x: 50, y: 10 },
          { x: 120, y: 90 },
          { x: 220, y: 30 },
        ],
      }),
    )
  })
})

describe('edge segments — shape invariants', () => {
  it('every segment list starts with exactly one move, and only one', () => {
    const results = [
      getBezierPath({ sourceX: 0, sourceY: 0, targetX: 100, targetY: 50 }),
      getStraightPath({ sourceX: 0, sourceY: 0, targetX: 100, targetY: 50 }),
      getSmoothStepPath({ sourceX: 0, sourceY: 0, targetX: 100, targetY: 50 }),
      getWaypointPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 100,
        targetY: 50,
        waypoints: [{ x: 50, y: 25 }],
      }),
    ]
    for (const r of results) {
      expect(r.segments[0]!.kind).toBe('move')
      expect(r.segments.filter((s) => s.kind === 'move')).toHaveLength(1)
    }
  })

  it('the final segment lands exactly on the edge target', () => {
    const targetX = 137
    const targetY = 84
    const r = getBezierPath({ sourceX: 0, sourceY: 0, targetX, targetY })
    const last = r.segments[r.segments.length - 1]!
    expect(last.x).toBe(targetX)
    expect(last.y).toBe(targetY)
  })
})

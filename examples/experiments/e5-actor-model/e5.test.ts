/**
 * E5 verification tests.
 *
 * For each bug pattern: prove the signal version reproduces the bug, and
 * prove the actor version doesn't. The actor-version assertions are the
 * actual GRADUATE / KILL signal — if any of them fail, the actor model
 * doesn't structurally prevent the bug and the experiment is KILL.
 */

import { describe, expect, it } from 'vitest'

import {
  actorVersion as actorListVersion,
  signalVersion as signalListVersion,
} from './pattern-a-list-race'
import {
  actorVersion as actorAsyncVersion,
  makeFakeFetcher,
  signalVersion as signalAsyncVersion,
} from './pattern-b-stale-async'

describe('Pattern A — stale-capture race between sibling handlers', () => {
  it('signal version: child2 (set up after child1.remove) DROPS child1\'s removal (the bug)', () => {
    const sv = signalListVersion()
    expect(sv.list()).toHaveLength(3)
    // Both children "set up" before any removals — each captures the
    // initial 3-item list as `items`. This is the documented anti-pattern.
    const child1 = sv.setupChild(1)
    const child2 = sv.setupChild(2)
    child1.remove()
    expect(sv.list()).toHaveLength(2) // [{2}, {3}] — looks correct
    child2.remove()
    // BUG: child2's handler computed `items.filter(x => x.id !== 2)` where
    // `items` is the SETUP-time snapshot of [{1},{2},{3}], not the
    // current list. So it sets list to [{1},{3}] — undoing child1's work.
    expect(sv.list().map((x) => x.id)).toEqual([1, 3])
    // The expected correct result would be [{3}] — both removals applied.
  })

  it('actor version: both removals stick — bug is structurally impossible', async () => {
    const av = actorListVersion()
    expect(av.getList()).toHaveLength(3)
    const child1 = av.setupChild(1)
    const child2 = av.setupChild(2)
    child1.remove()
    child2.remove()
    await av.flush()
    // Each child can ONLY send a message — no value to capture, no stale
    // read possible. The reducer reads current state every time.
    expect(av.getList().map((x) => x.id)).toEqual([3])
  })
})

describe('Pattern B — stale-closure async fetch race', () => {
  it('signal version overwrites current data with late-arriving stale response (the bug)', async () => {
    const fetcher = makeFakeFetcher()
    const sv = signalAsyncVersion(fetcher)
    // Click user 1 (slow fetch), then click user 2 (fast fetch).
    // Order of resolution: user 2 first, then user 1 LATER.
    // BUG: user 1's late arrival overwrites user 2's data.
    const p1 = sv.selectUser(1, 50) // slow
    const p2 = sv.selectUser(2, 5) // fast
    await Promise.all([p1, p2])
    // Expected (correct): current === user 2 (the latest selection).
    // Actual (buggy): current === user 1 (late stale response won).
    expect(sv.getCurrent()).toEqual({ id: 1, name: 'user-1' })
  })

  it('actor version keeps user 2 — stale response rejected by requestId check', async () => {
    const fetcher = makeFakeFetcher()
    const av = actorAsyncVersion(fetcher)
    av.selectUser(1, 50) // slow — will resolve LAST
    av.selectUser(2, 5) // fast — will resolve FIRST
    // Wait for both fetches + actor message processing to settle.
    await new Promise<void>((res) => setTimeout(res, 100))
    await av.flush()
    // Reducer rejected user 1's late response because requestId moved on.
    expect(av.getCurrent()).toEqual({ id: 2, name: 'user-2' })
  })
})

// ─── LOC discipline check ──────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('LOC discipline (per E5 GRADUATE criterion: actor ≤2× signal)', () => {
  function countLines(file: string, fnName: string): number {
    const src = readFileSync(join(HERE, file), 'utf8')
    // Count from `export function fnName` to its closing `}` at column 0.
    const startMatch = src.match(new RegExp(`^export function ${fnName}\\b`, 'm'))
    if (!startMatch || startMatch.index === undefined) return 0
    const start = startMatch.index
    // Find first line starting with `}` after start.
    const after = src.slice(start)
    const endRel = after.search(/\n\}/m)
    if (endRel === -1) return 0
    const block = after.slice(0, endRel + 2)
    // Count non-blank, non-comment-only lines.
    return block.split('\n').filter((l) => {
      const t = l.trim()
      return t.length > 0 && !t.startsWith('//') && !t.startsWith('*')
    }).length
  }

  it('Pattern A: actor LOC ≤ 2× signal LOC', () => {
    const sigLoc = countLines('pattern-a-list-race.ts', 'signalVersion')
    const actorLoc = countLines('pattern-a-list-race.ts', 'actorVersion')
    expect(sigLoc).toBeGreaterThan(0)
    expect(actorLoc).toBeGreaterThan(0)
    // GRADUATE bound: actor ≤ 2× signal
    expect(actorLoc / sigLoc).toBeLessThanOrEqual(2)
  })

  it('Pattern B: actor LOC ≤ 2× signal LOC', () => {
    const sigLoc = countLines('pattern-b-stale-async.ts', 'signalVersion')
    const actorLoc = countLines('pattern-b-stale-async.ts', 'actorVersion')
    expect(sigLoc).toBeGreaterThan(0)
    expect(actorLoc).toBeGreaterThan(0)
    expect(actorLoc / sigLoc).toBeLessThanOrEqual(2)
  })
})

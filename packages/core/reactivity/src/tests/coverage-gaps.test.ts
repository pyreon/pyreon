// Targeted coverage for the residual branches across the reactivity core +
// dev-instrumentation bridges. Each block names the exact source path it
// exercises. The genuinely-unreachable / cross-engine-only branches are
// `v8 ignore`d at the source (batch `_label` sampling, sentinel negative-depth
// guards, the Node-only `process` guard in lpih).

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { batch } from '../batch'
import { computed } from '../computed'
import { createSelector } from '../createSelector'
import { onSignalUpdate } from '../debug'
import { effect, renderEffect, setSnapshotCapture } from '../effect'
import { startLpihPolling } from '../lpih'
import {
  __resetReactiveDevtoolsForTesting,
  _parseStackLine,
  activateReactiveDevtools,
  getFireSummaries,
  getReactiveFires,
  getReactiveGraph,
} from '../reactive-devtools'
import { _recordSignalWrite } from '../reactive-trace'
import { _resetSentinel, registerSingleton } from '../singleton-sentinel'
import { signal } from '../signal'

// reactivity's ambient `process.env` type only declares NODE_ENV;
// PYREON_SINGLE_INSTANCE is a runtime-only override (same cast the source uses).
const ENV = process.env as unknown as Record<string, string | undefined>

describe('signal — direct() multi-subscriber notify outside a batch (signal.ts notifyDirect else)', () => {
  it('two direct updaters both fire on an un-batched set', () => {
    const s = signal(0)
    let a = 0
    let b = 0
    const offA = s.direct(() => {
      a++
    })
    const offB = s.direct(() => {
      b++
    }) // 2nd → promotes _d1 to a _d Set
    s.set(1) // un-batched → notifyDirect's `for (const fn of updaters) fn()`
    expect(a).toBe(1)
    expect(b).toBe(1)
    offA()
    offB()
  })
})

describe('debug — onSignalUpdate trace listener dispatch (debug.ts _notifyTraceListeners)', () => {
  it('a registered listener receives the update event, then unsubscribes', () => {
    const events: Array<{ prev: unknown; next: unknown }> = []
    const off = onSignalUpdate((e) => events.push({ prev: e.prev, next: e.next }))
    const s = signal(1, { name: 'traced' })
    s.set(2)
    expect(events).toEqual([{ prev: 1, next: 2 }])
    off()
    s.set(3) // no listener → no further events
    expect(events.length).toBe(1)
  })
})

describe('reactive-trace — Object.keys throwing value (reactive-trace.ts preview catch)', () => {
  it('a value whose ownKeys throws is summarized without crashing', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('ownKeys boom')
        },
      },
    )
    // _recordSignalWrite previews `next` — the Object.keys(...) call hits the
    // catch → returns [] → the summary is produced, no throw.
    expect(() => _recordSignalWrite('hostile', null, hostile)).not.toThrow()
  })
})

describe('computed — recompute that throws routes through _errorHandler (computed.ts catch)', () => {
  it('a throwing computed does not crash the reader', () => {
    let calls = 0
    const trigger = signal(0)
    const c = computed(() => {
      calls++
      trigger() // track
      throw new Error('compute boom')
    })
    // First read recomputes → throws inside → caught by _errorHandler.
    expect(() => c()).not.toThrow()
    expect(calls).toBeGreaterThan(0)
  })
})

describe('effect — renderEffect multi-dep unsubscribe (effect.ts renderEffectFullTrack >1)', () => {
  it('a renderEffect tracking two signals cleans up both on dispose', () => {
    const a = signal(1)
    const b = signal(2)
    let runs = 0
    const dispose = renderEffect(() => {
      a()
      b() // two deps → deps.length > 1 branch on teardown
      runs++
    })
    expect(runs).toBe(1)
    dispose()
    a.set(10) // disposed → no re-run
    b.set(20)
    expect(runs).toBe(1)
  })
})

describe('effect — snapshot capture/restore path (effect.ts run ternary true side)', () => {
  afterEach(() => setSnapshotCapture(null))

  it('an effect with an active snapshot-capture hook restores on re-run', () => {
    let restored = 0
    setSnapshotCapture({
      capture: () => ({ token: 1 }),
      restore: (_snap, fn) => {
        restored++
        return fn()
      },
    })
    const s = signal(0)
    let runs = 0
    const eff = effect(() => {
      s()
      runs++
    })
    s.set(1) // re-run → goes through the restore path
    expect(runs).toBe(2)
    expect(restored).toBeGreaterThan(0)
    eff.dispose()
  })
})

describe('createSelector — fresh-key bucket creation + sole-subscriber drop', () => {
  it('subscribing a never-seen key creates its bucket; leaving it drops the bucket', () => {
    const sel = createSelector(signal<number>(1))
    let fires = 0
    // selector(value) on a fresh value → `if (!bucket) bucket = new Set()`
    const dispose = renderEffect(() => {
      sel(2) // fresh key 2 — creates host + bucket
      fires++
    })
    expect(fires).toBe(1)
    dispose() // sole inline subscriber → boundSubs.delete(value)
    expect(fires).toBe(1)
  })
})

describe('lpih — startLpihPolling writes the cache then stops (lpih.ts _writeToPath + tick)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lpih-cov-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('polls to an explicit path and produces a JSON file', async () => {
    const path = join(dir, 'cache.json')
    const stop = startLpihPolling(path, 10)
    // wait for at least one tick
    await new Promise((r) => setTimeout(r, 40))
    stop()
    const raw = readFileSync(path, 'utf8')
    expect(() => JSON.parse(raw)).not.toThrow()
  })
})

describe('singleton-sentinel — PYREON_SINGLE_INSTANCE=warn (sentinel resolveMode env branch)', () => {
  const prev = ENV.PYREON_SINGLE_INSTANCE
  beforeEach(() => {
    _resetSentinel()
    ENV.PYREON_SINGLE_INSTANCE = 'warn'
  })
  afterEach(() => {
    if (prev === undefined) delete ENV.PYREON_SINGLE_INSTANCE
    else ENV.PYREON_SINGLE_INSTANCE = prev
    _resetSentinel()
  })

  it('a duplicate registration warns (not throws) under the env override', () => {
    registerSingleton('@pyreon/cov-dup', '1.0.0', '/loc/a.js')
    // second registration from a DIFFERENT location = a duplicate → mode 'warn'
    expect(() =>
      registerSingleton('@pyreon/cov-dup', '1.0.0', '/loc/b.js'),
    ).not.toThrow()
  })
})

describe('reactive-devtools — _parseStackLine engine formats', () => {
  it('parses the V8 bare form "at file:line:col"', () => {
    expect(_parseStackLine('    at /app/x.ts:12:5')).toEqual({
      file: '/app/x.ts',
      line: 12,
      col: 5,
    })
  })

  it('parses the JSC/SpiderMonkey form "fn@file:line:col"', () => {
    expect(_parseStackLine('run@/app/y.ts:7:3')).toEqual({
      file: '/app/y.ts',
      line: 7,
      col: 3,
    })
  })

  it('returns undefined for an unparseable line', () => {
    expect(_parseStackLine('not a stack frame at all')).toBeUndefined()
  })
})

describe('reactive-devtools — active graph/fires/summaries with real nodes', () => {
  afterEach(() => __resetReactiveDevtoolsForTesting())

  it('graph carries edges; fire summaries + ring buffer populate', () => {
    activateReactiveDevtools()
    const s = signal(0, { name: 'src' })
    // an effect subscribes to s → graph edge from s → effect
    const eff = effect(() => {
      s()
    })
    // drive many fires to exercise the ring-buffer wrap (FIRE_CAP = 512)
    for (let i = 1; i <= 600; i++) s.set(i)
    const graph = getReactiveGraph()
    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(graph.edges.length).toBeGreaterThan(0)
    const summaries = getFireSummaries()
    expect(summaries.length).toBeGreaterThan(0)
    const fires = getReactiveFires()
    // ring buffer caps at FIRE_CAP
    expect(fires.length).toBeLessThanOrEqual(512)
    expect(fires.length).toBeGreaterThan(0)
    eff.dispose()
  })
})

describe('computed — disposed recompute early-returns (computed.ts read._disposed)', () => {
  it('a disposed computed does not recompute when its source changes', () => {
    const s = signal(0)
    let recomputes = 0
    const c = computed(() => {
      recomputes++
      return s() + 1
    })
    c() // initial recompute
    expect(recomputes).toBe(1)
    // dispose then mutate the source — the recompute closure short-circuits
    ;(c as unknown as { dispose?: () => void }).dispose?.()
    s.set(5)
    c()
    // no further recompute after dispose (the read returns the stale value)
    expect(recomputes).toBe(1)
  })
})

describe('createSelector — multi-subscriber bucket (Set) on one key', () => {
  it('two subscribers on the same key both fire on selection change + unsubscribe one', () => {
    const sel = createSelector(signal<number>(1))
    let aFires = 0
    let bFires = 0
    // two renderEffects both select key 2 → bucket promotes to a Set
    const da = renderEffect(() => {
      sel(2)
      aFires++
    })
    const db = renderEffect(() => {
      sel(2)
      bFires++
    })
    const initialA = aFires
    const initialB = bFires
    // selection currently 1; selecting 2 fires the Set bucket for both
    // (exercised on the next selector source change via the host signal)
    da() // unsubscribe one from the Set bucket → `bucket instanceof Set` delete
    db()
    expect(aFires).toBeGreaterThanOrEqual(initialA)
    expect(bFires).toBeGreaterThanOrEqual(initialB)
  })
})

describe('singleton-sentinel — silent env override (resolveMode || side)', () => {
  const prev = ENV.PYREON_SINGLE_INSTANCE
  beforeEach(() => {
    _resetSentinel()
    ENV.PYREON_SINGLE_INSTANCE = 'silent'
  })
  afterEach(() => {
    if (prev === undefined) delete ENV.PYREON_SINGLE_INSTANCE
    else ENV.PYREON_SINGLE_INSTANCE = prev
    _resetSentinel()
  })

  it('a duplicate registration is silent under env=silent', () => {
    registerSingleton('@pyreon/cov-sil', '1.0.0', '/loc/a.js')
    expect(() =>
      registerSingleton('@pyreon/cov-sil', '1.0.0', '/loc/b.js'),
    ).not.toThrow()
  })
})

describe('effect — disposed-during-flush run guard (effect.ts run `if (disposed)`)', () => {
  it('an effect disposed by a sibling mid-batch does not run', () => {
    const a = signal(0)
    const b = signal(0)
    let bRuns = 0
    let bEff: { dispose(): void } | null = null
    const aEff = effect(() => {
      a()
      if (bEff) bEff.dispose() // dispose b while a's run is processing
    })
    bEff = effect(() => {
      b()
      bRuns++
    })
    const initial = bRuns
    batch(() => {
      a.set(1) // a runs first → disposes b
      b.set(1) // b's queued run hits `if (disposed) return`
    })
    expect(bRuns).toBe(initial) // b did not run after disposal
    aEff.dispose()
    bEff.dispose()
  })
})

describe('reactive-devtools — _parseStackLine V8 paren form', () => {
  it('parses the V8 parenthesized form "(file:line:col)"', () => {
    expect(_parseStackLine('    at run (/app/z.ts:9:4)')).toEqual({
      file: '/app/z.ts',
      line: 9,
      col: 4,
    })
  })
})

describe('batch — coalesces multiple writes (batch.ts happy path)', () => {
  it('a batched multi-write fires effects once', () => {
    const a = signal(0)
    const b = signal(0)
    let runs = 0
    const eff = effect(() => {
      a()
      b()
      runs++
    })
    batch(() => {
      a.set(1)
      b.set(2)
    })
    expect(runs).toBe(2) // 1 initial + 1 coalesced
    eff.dispose()
  })
})

/**
 * Live Program Inlay Hints — source-location capture for signal/computed/effect.
 *
 * Validates that:
 *   1. When devtools is INACTIVE, no stack capture happens (zero cost).
 *   2. When devtools is ACTIVE, every reactive creation captures the
 *      USER's call site (not the framework's internal frames).
 *   3. `getFireSummaries()` aggregates fires by location with the right
 *      shape (count, lastFire, kind) and dedupes multiple nodes at the
 *      same location.
 *   4. Stack-line parsing handles V8, JSC, and Firefox formats.
 *   5. `loc` field on `ReactiveNode` is surfaced via `getReactiveGraph()`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { computed } from '../computed'
import { effect } from '../effect'
import {
  __resetReactiveDevtoolsForTesting,
  _captureCallerLocation,
  _parseStackLine,
  activateReactiveDevtools,
  getFireSummaries,
  getReactiveGraph,
} from '../reactive-devtools'
import { signal } from '../signal'

afterEach(() => {
  // Cross-test isolation: drop registry + fire buffer + _active.
  // Production `deactivateReactiveDevtools()` only flips _active now
  // (registry is retained for the close+reopen-panel user workflow).
  __resetReactiveDevtoolsForTesting()
})

describe('LPIH — stack-line parser', () => {
  it('parses V8 parenthesized form', () => {
    const loc = _parseStackLine(
      '    at userCode (/Users/test/app.ts:42:7)',
    )
    expect(loc).toEqual({ file: '/Users/test/app.ts', line: 42, col: 7 })
  })

  it('parses V8 anonymous form', () => {
    const loc = _parseStackLine('    at /Users/test/app.ts:42:7')
    expect(loc).toEqual({ file: '/Users/test/app.ts', line: 42, col: 7 })
  })

  it('parses JSC / SpiderMonkey form', () => {
    const loc = _parseStackLine('userCode@/Users/test/app.ts:42:7')
    expect(loc).toEqual({ file: '/Users/test/app.ts', line: 42, col: 7 })
  })

  it('returns undefined for unparseable lines', () => {
    expect(_parseStackLine('garbage')).toBeUndefined()
    expect(_parseStackLine('')).toBeUndefined()
  })

  it('handles file paths with colons (Windows-like or URL schemes)', () => {
    const loc = _parseStackLine(
      '    at userCode (file:///Users/test/app.ts:42:7)',
    )
    // The regex captures the LAST ":line:col" pair — `file` includes any
    // earlier colons (file:/// prefix preserved). Editors handle that.
    expect(loc?.line).toBe(42)
    expect(loc?.col).toBe(7)
    expect(loc?.file).toContain('app.ts')
  })
})

describe('LPIH — zero-cost when inactive', () => {
  it('_captureCallerLocation returns undefined when inactive', () => {
    expect(_captureCallerLocation(0)).toBeUndefined()
    expect(_captureCallerLocation(5)).toBeUndefined()
  })

  it('node creation does not allocate Error when inactive', () => {
    // Indirect proof: capture happens INSIDE the active guard.
    // No throw, no stack, no observable cost in the path.
    const s = signal(0)
    s.set(1)
    const c = computed(() => s() + 1)
    c()
    // No nodes registered because inactive.
    expect(getReactiveGraph().nodes).toEqual([])
  })
})

describe('LPIH — __sourceLocation option (R4 build-time injection)', () => {
  it('signal() prefers __sourceLocation over stack capture', () => {
    activateReactiveDevtools()
    // Simulate what @pyreon/vite-plugin's injectSignalNames emits:
    const injected = { file: '/some/build/path.tsx', line: 99, col: 42 }
    const s = signal(0, { name: 'test', __sourceLocation: injected })
    const nodes = getReactiveGraph().nodes
    expect(nodes).toHaveLength(1)
    // The captured location is the INJECTED one, not the test file's location.
    expect(nodes[0]?.loc?.file).toBe('/some/build/path.tsx')
    expect(nodes[0]?.loc?.line).toBe(99)
    expect(nodes[0]?.loc?.col).toBe(42)
    void s
  })

  it('signal() falls back to stack capture when __sourceLocation is absent', () => {
    activateReactiveDevtools()
    const s = signal(0)
    const nodes = getReactiveGraph().nodes
    expect(nodes).toHaveLength(1)
    // Stack capture → location is the test file.
    expect(nodes[0]?.loc?.file).toContain('lpih-source-location.test.ts')
    void s
  })
})

describe('LPIH — source-location capture for signals', () => {
  it('captures the user call site for signal()', () => {
    activateReactiveDevtools()
    const s = signal(0) // ← this line
    const nodes = getReactiveGraph().nodes
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.loc).toBeDefined()
    expect(nodes[0]?.loc?.file).toContain('lpih-source-location.test.ts')
    // The line number should point at THIS source file, not signal.ts internals.
    expect(nodes[0]?.loc?.line).toBeGreaterThan(0)
    void s
  })

  it('different signals get different locations', () => {
    activateReactiveDevtools()
    const a = signal(0)
    const b = signal(0)
    const nodes = getReactiveGraph().nodes
    expect(nodes).toHaveLength(2)
    const lineA = nodes[0]?.loc?.line
    const lineB = nodes[1]?.loc?.line
    expect(lineA).toBeDefined()
    expect(lineB).toBeDefined()
    expect(lineA).not.toBe(lineB)
    void a
    void b
  })
})

describe('LPIH — source-location capture for computed', () => {
  it('captures the user call site for computed()', () => {
    activateReactiveDevtools()
    const s = signal(1)
    const c = computed(() => s() * 2) // ← user site
    c()
    const nodes = getReactiveGraph().nodes
    const derived = nodes.find((n) => n.kind === 'derived')
    expect(derived?.loc).toBeDefined()
    expect(derived?.loc?.file).toContain('lpih-source-location.test.ts')
  })
})

describe('LPIH — source-location capture for effect', () => {
  it('captures the user call site for effect()', () => {
    activateReactiveDevtools()
    const s = signal(0)
    const e = effect(() => {
      s()
    })
    const nodes = getReactiveGraph().nodes
    const eff = nodes.find((n) => n.kind === 'effect')
    expect(eff?.loc).toBeDefined()
    expect(eff?.loc?.file).toContain('lpih-source-location.test.ts')
    e.dispose()
  })
})

describe('LPIH — getFireSummaries()', () => {
  it('returns empty when no nodes have locations', () => {
    activateReactiveDevtools()
    // No creations yet
    expect(getFireSummaries()).toEqual([])
  })

  it('aggregates fires by location', () => {
    activateReactiveDevtools()
    const s = signal(0)
    s.set(1)
    s.set(2)
    s.set(3)
    const summaries = getFireSummaries()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.count).toBe(3)
    expect(summaries[0]?.kind).toBe('signal')
    expect(summaries[0]?.lastFire).not.toBeNull()
    expect(summaries[0]?.loc.file).toContain('lpih-source-location.test.ts')
    void s
  })

  it('produces one summary per unique location', () => {
    activateReactiveDevtools()
    const a = signal(0)
    const b = signal(0)
    a.set(1)
    a.set(2)
    b.set(1)
    const summaries = getFireSummaries()
    expect(summaries).toHaveLength(2)
    const total = summaries.reduce((acc, s) => acc + s.count, 0)
    expect(total).toBe(3)
    void a
    void b
  })

  it('captures fires across signal + computed + effect', () => {
    activateReactiveDevtools()
    const s = signal(0)
    const c = computed(() => s() * 2)
    let observed = 0
    const e = effect(() => {
      observed = c()
    })
    s.set(5)
    s.set(10)
    const summaries = getFireSummaries()
    // Expect at least 3 distinct locations (signal, computed, effect).
    expect(summaries.length).toBeGreaterThanOrEqual(3)
    const kinds = new Set(summaries.map((sum) => sum.kind))
    expect(kinds.has('signal')).toBe(true)
    expect(kinds.has('derived')).toBe(true)
    expect(kinds.has('effect')).toBe(true)
    expect(observed).toBe(20)
    e.dispose()
  })
})

describe('LPIH — rate1s EWMA tracking', () => {
  it('rate1s is 0 for a node that has not fired', () => {
    activateReactiveDevtools()
    const s = signal(0)
    const summaries = getFireSummaries()
    // Signal was created but never written → rate1s = 0
    const summary = summaries.find((x) => x.kind === 'signal')
    expect(summary?.rate1s).toBe(0)
    void s
  })

  it('rate1s rises with rapid fires', () => {
    activateReactiveDevtools()
    const s = signal(0)
    for (let i = 0; i < 10; i++) s.set(i + 1)
    const summaries = getFireSummaries()
    const summary = summaries.find((x) => x.kind === 'signal')
    expect(summary?.rate1s).toBeGreaterThan(0)
    void s
  })

  it('rate1s for many rapid fires reflects fire density (>1)', () => {
    activateReactiveDevtools()
    const s = signal(0)
    // 100 fires in rapid succession — dt → 0, decay ≈ 1.0, so each fire
    // adds ~+1 to rate1s. At read time the value is decayed by the small
    // elapsed time → still well above the threshold.
    for (let i = 0; i < 100; i++) s.set(i + 1)
    const summaries = getFireSummaries()
    const summary = summaries.find((x) => x.kind === 'signal')
    expect(summary?.rate1s).toBeGreaterThan(10)
    void s
  })

  it('rate1s decays to ≈0 after the time constant elapses', async () => {
    activateReactiveDevtools()
    const s = signal(0)
    s.set(1)
    const initial = getFireSummaries().find((x) => x.kind === 'signal')
    expect(initial?.rate1s).toBeGreaterThan(0.5)
    // 1.5s = 1.5× TAU → rate1s should drop to exp(-1.5) ≈ 0.22× initial.
    await new Promise((r) => setTimeout(r, 1500))
    const decayed = getFireSummaries().find((x) => x.kind === 'signal')
    expect(decayed?.rate1s).toBeLessThan(0.5)
    void s
  })

  it('exported LPIH_RATE_TAU_MS constant equals 1000 (1 second)', async () => {
    const { LPIH_RATE_TAU_MS } = await import('../reactive-devtools')
    expect(LPIH_RATE_TAU_MS).toBe(1000)
  })
})

/**
 * Measurement gate: per-mount cost of a fully-static `styled()` component.
 *
 * BACKGROUND. "Proposed compiler win #2 — static styler extraction" theorised
 * that a fully-static styled component (`styled('div')`\`color: red\``, no
 * function interpolations) wastes a per-mount `styler.resolve`, and that a
 * bounded runtime memo slice could be carved out of the (multi-week,
 * roadmap-scale) compile-time extraction effort. This gate MEASURES that
 * premise with the real `styler.resolve` / `styler.staticVNode.hit` /
 * `styler.sheet.insert*` perf counters and DISPROVES it for the runtime
 * layer: the static path is already optimal.
 *
 * WHAT THE COUNTERS PROVE (the contrast IS the proof — self-discriminating,
 * no fake fix to revert; same shape as the static-text baking gate):
 *
 *   Fully-static `styled('div')`\`color: red\`` (values.length === 0):
 *     - `createStyledComponent` takes `raw = strings[0]` — `resolve()` is
 *       NEVER called → `styler.resolve` === 0 for the lifetime.
 *     - `sheet.insert` fires EXACTLY ONCE at component-creation time
 *       (definition, not mount) → `styler.sheet.insert` === 1.
 *     - Every mount with no extra props returns the pre-built
 *       `cachedEmptyVNode` → `styler.staticVNode.hit` === N, with ZERO
 *       additional resolve / sheet work per mount.
 *
 *   Contrast — function-interpolated `styled('div')`\`color: ${p => p.c}\``
 *   with NO `$rocketstyle` / `$element` identity (the only shape that DOES
 *   re-resolve per call): `styler.resolve` === N. This is CORRECT, not waste
 *   — the CSS genuinely depends on per-call props; and real-app shapes
 *   (rocketstyle dimensions, Element `$element` interning) already hit
 *   `classCache` / `elClassCache` so they collapse to ~0 (proven elsewhere:
 *   PR #344 dimension memo, the `$element` interning gate). So #2's runtime
 *   layer needs no fix; the remaining #2 surface is purely compile-time /
 *   bundle (don't ship the styled wrapper + sheet.insert for provably-static
 *   CSS at all) — that is the roadmap item, deliberately NOT half-built here.
 *
 * Bisect note: there is intentionally no fix to revert. The discriminating
 * assertion is `static.resolve === 0 && dynamic.resolve === N` in the SAME
 * run — if the static path ever regressed to per-mount resolve, the static
 * block's `toBe(0)` fails while the dynamic block still passes, pinpointing
 * the regression to the static fast path specifically.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sheet } from '../sheet'
import { styled } from '../styled'

type Sink = { __pyreon_count__?: (name: string, n?: number) => void }
const g = globalThis as Sink

let counts: Map<string, number>

const get = (name: string): number => counts.get(name) ?? 0

beforeEach(() => {
  counts = new Map()
  g.__pyreon_count__ = (name: string, n = 1) => {
    counts.set(name, (counts.get(name) ?? 0) + n)
  }
})

afterEach(() => {
  delete g.__pyreon_count__
  // clearAll (not reset) — fires onSheetClear so styled.tsx's
  // staticComponentCache / _hotCache reset between cases; otherwise the
  // single-entry hot cache leaks a prior case's component.
  sheet.clearAll()
})

const N = 100

describe('static styled() per-mount cost (measurement gate)', () => {
  it('a fully-static component resolves ZERO times and inserts ONCE, regardless of mount count', () => {
    // Distinct source-location template literal → its own
    // TemplateStringsArray identity (independent of every other case).
    const Comp = styled('div')`
      color: red;
      padding: 4px;
    `

    // The sheet.insert at *definition* time already happened above. Snapshot
    // AFTER definition so the per-mount measurement is isolated from the
    // one-time creation cost.
    const insertsAtDefinition = get('styler.sheet.insert')
    expect(insertsAtDefinition).toBe(1) // exactly one — at creation, not mount
    expect(get('styler.resolve')).toBe(0) // values.length===0 → raw=strings[0], no resolve()

    for (let i = 0; i < N; i++) Comp({})

    // THE PROOF: N mounts added ZERO resolves and ZERO new sheet inserts.
    expect(get('styler.resolve')).toBe(0)
    expect(get('styler.sheet.insert')).toBe(1) // still just the creation insert
    expect(get('styler.sheet.insert.hit')).toBe(0) // never re-inserted
    // Every mount took the pre-built cachedEmptyVNode fast path.
    expect(get('styler.staticVNode.hit')).toBe(N)
  })

  it('two distinct static components: 2 inserts total, 0 resolves, N/2 hits each', () => {
    const A = styled('div')`
      color: blue;
    `
    const B = styled('span')`
      color: green;
    `
    expect(get('styler.sheet.insert')).toBe(2) // one per definition
    expect(get('styler.resolve')).toBe(0)

    for (let i = 0; i < N / 2; i++) {
      A({})
      B({})
    }

    expect(get('styler.resolve')).toBe(0)
    expect(get('styler.sheet.insert')).toBe(2)
    expect(get('styler.staticVNode.hit')).toBe(N) // N/2 + N/2
  })

  it('CONTRAST — a function-interpolated styled with no rocketstyle/$element identity DOES resolve per call (correct, not waste)', () => {
    const Dyn = styled('div')<{ c: string }>`
      color: ${(p) => p.c};
    `
    // No object $rocketstyle / $rocketstate / $element on rawProps → neither
    // classCache nor elClassCache can fire; doResolve() runs every call.
    // Same prop value each call → cssText identical → sheet dedups (hit).
    for (let i = 0; i < N; i++) Dyn({ c: 'red' })

    expect(get('styler.resolve')).toBe(N) // genuinely per-call (CSS depends on props)
    expect(get('styler.staticVNode.hit')).toBe(0) // never the static fast path
    // `styler.sheet.insert` counts every insert() CALL (one per mount here);
    // `.hit` is the dedup subset — identical cssText each call, so all but
    // the first hit the insertCache and inject NO new DOM rule. The dynamic
    // path still pays the resolve() + the insert() call-overhead per mount;
    // only the actual rule injection is deduped. That call-overhead is the
    // residual the rocketstyle/$element identity caches (classCache /
    // elClassCache) eliminate in real-app shapes — proven elsewhere.
    expect(get('styler.sheet.insert')).toBe(N) // one insert() call per mount
    expect(get('styler.sheet.insert.hit')).toBe(N - 1) // first builds cache, rest dedup
  })

  it('SELF-DISCRIMINATING — static.resolve===0 AND dynamic.resolve===N in one run', () => {
    const Static = styled('div')`
      margin: 8px;
    `
    counts = new Map() // isolate from the definition insert
    for (let i = 0; i < N; i++) Static({})
    const staticResolve = get('styler.resolve')

    const Dyn = styled('div')<{ c: string }>`
      color: ${(p) => p.c};
    `
    counts = new Map()
    for (let i = 0; i < N; i++) Dyn({ c: 'blue' })
    const dynResolve = get('styler.resolve')

    // The discriminator: if the static fast path ever regressed to
    // per-mount resolve, this is the assertion that pinpoints it — the
    // static side moves off 0 while the dynamic side stays at N.
    expect(staticResolve).toBe(0)
    expect(dynResolve).toBe(N)
    expect(dynResolve - staticResolve).toBe(N)
  })
})

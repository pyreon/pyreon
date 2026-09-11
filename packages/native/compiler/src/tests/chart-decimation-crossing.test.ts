import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

// `decimate-values.ts` joined the generated chart engine, so `lttbIndices` and
// `minMaxBuckets` are real symbols on both targets. Two things follow, and both
// need holding down: the web-only warning must stop naming them, and the emitted
// call must actually COMPILE — a warning count is not a compile, and this file
// exists because the remedy the emitter now RECOMMENDS was checked that way and
// turned out to warn.

/** The snippet `plotUnloweredWarning` tells a user to write for `maxPoints`. */
const PRE_DECIMATED = `
import { signal } from '@pyreon/reactivity'
import { lttbIndices, PlotChart, line } from '@pyreon/charts/plot'

interface Row { t: number; v: number }

export function Big(): JSX.Element {
  const rows = signal<Row[]>([])
  const ys: number[] = rows().map((r) => r.v * 1.0)
  const keep = lttbIndices([], ys, 1000)
  const thinned = keep.map((i) => rows()[i]!)
  return <PlotChart data={thinned} marks={[line((d: Row) => d.v)]} />
}
`

/** `lttb` takes \`Pt[]\` and genuinely stays web — it must still warn. */
const PT_WRAPPER = `
import { signal } from '@pyreon/reactivity'
import { lttb, PlotChart, line } from '@pyreon/charts/plot'

interface Row { t: number; v: number }

export function Big(): JSX.Element {
  const rows = signal<{ x: number; y: number }[]>([])
  const thinned = lttb(rows(), 1000)
  return <PlotChart data={thinned} marks={[line((d: { y: number }) => d.y)]} />
}
`

const MAX_POINTS = `
import { signal } from '@pyreon/reactivity'
import { PlotChart, line } from '@pyreon/charts/plot'
interface Row { label: string; v: number }
export function Big(): JSX.Element {
  const rows = signal<Row[]>([])
  const selected = signal<number[]>([])
  return <PlotChart data={rows()} x={(d: Row) => d.label} marks={[line((d: Row, i: number) => d.v + i)]} maxPoints={500} dataZoom selectedMode="multiple" onSelectIndex={(i: number) => { selected.set([i]) }} />
}
`

describe('the decimation arithmetic crosses', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: pre-decimating with lttbIndices raises no warning`, () => {
      // Before `decimate-values.ts` joined ENGINE_FILES this produced
      // "lttbIndices … has NO native lowering … the native build fails with
      // cannot find 'lttbIndices' in scope" — which was true then and would be
      // a lie now. The allowlist entry beside `binValues` is what fixes it.
      const r = transform(PRE_DECIMATED, { target })
      expect(r.warnings ?? [], (r.warnings ?? []).join('\n')).toEqual([])
      expect(r.code).toContain('lttbIndices(')
    })

    it(`${target}: the Pt[] wrapper still warns by name`, () => {
      // The other direction. `lttb` is the reason the arithmetic was split out
      // of it at all; if this stopped warning, a user would get a native build
      // failing on a symbol that really is absent.
      const r = transform(PT_WRAPPER, { target })
      const warnings = (r.warnings ?? []).join('\n')
      expect(warnings).toContain('lttb')
      expect(warnings).toContain('NO native lowering')
    })
  }

  it('maxPoints lowers row thinning and original-index mapping on Swift', () => {
    const r = transform(MAX_POINTS, { target: 'swift' })
    expect(r.warnings ?? [], (r.warnings ?? []).join('\n')).toEqual([])
    expect(r.code).toContain('lttbIndices([], pyreonDecimateValues, pyreonMaxPoints)')
    expect(r.code).toContain('let pyreonRows = pyreonKeep.map { pyreonSourceRows[$0] }')
    expect(r.code).toContain('let pyreonI = pyreonKeep[pyreonJ] + pyreonRange.from')
    expect(r.code).toContain('pyreonKeep[pyreonHit] + pyreonRange.from')
    expect(r.code).toContain('pyreonKeep.firstIndex(of: pyreonGlobal - pyreonRange.from)')
  })

  it('maxPoints lowers the same semantics on Kotlin', () => {
    const r = transform(MAX_POINTS, { target: 'kotlin' })
    expect(r.warnings ?? [], (r.warnings ?? []).join('\n')).toEqual([])
    expect(r.code).toContain('lttbIndices(listOf(), pyreonDecimateValues, pyreonMaxPoints)')
    expect(r.code).toContain('val pyreonRows = pyreonKeep.map { pyreonSourceRows[it] }')
    expect(r.code).toContain('val pyreonI = pyreonKeep[pyreonJ] + pyreonRange.from')
    expect(r.code).toContain('pyreonKeep[pyreonHit] + pyreonRange.from')
    expect(r.code).toContain('pyreonKeep.indexOf(pyreonGlobal - pyreonRange.from)')
  })

  it('the maxPoints Swift emit typechecks', { skip: !isSwiftcAvailable() }, () => {
    const r = validateSwiftWithStubs(transform(MAX_POINTS, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it('the maxPoints Kotlin emit typechecks', { skip: !isKotlincAvailable() }, () => {
    const r = validateKotlin(transform(MAX_POINTS, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it('a number-annotated series with integer literals is accepted by both toolchains', () => {
    // Both current toolchains accept the generated call. Keep this compile
    // contract positive instead of pinning an obsolete compiler failure.
    const withoutWidening = PRE_DECIMATED.replace('rows().map((r) => r.v * 1.0)', 'rows().map((r) => r.v)')
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(withoutWidening, { target })
      expect(r.warnings ?? [], `${target} started warning — update the remedy text`).toEqual([])
    }
    if (isSwiftcAvailable()) {
      expect(validateSwiftWithStubs(transform(withoutWidening, { target: 'swift' }).code).ok).toBe(true)
    }
    if (isKotlincAvailable()) {
      expect(validateKotlin(transform(withoutWidening, { target: 'kotlin' }).code).ok).toBe(true)
    }
  })

  it('swiftc accepts the pre-decimated emit', { skip: !isSwiftcAvailable() }, () => {
    const r = validateSwiftWithStubs(transform(PRE_DECIMATED, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it('kotlinc accepts the pre-decimated emit', { skip: !isKotlincAvailable() }, () => {
    const r = validateKotlin(transform(PRE_DECIMATED, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

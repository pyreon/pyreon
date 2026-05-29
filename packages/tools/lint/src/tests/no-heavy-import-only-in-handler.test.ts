/**
 * Tests for `pyreon/no-heavy-import-only-in-handler`.
 *
 * The rule fires ONLY when every reference to a statically-imported heavy
 * module is inside a deferred scope (JSX `on*` handler or lifecycle
 * callback) — meaning the static import is provably safe AND beneficial
 * to convert to a dynamic `import()`. Conservative by construction: any
 * eager reference suppresses the report (false negative tolerated, false
 * positive forbidden). Distilled from the Tier-2 spike's L3 heavy-import
 * detection — the one part of that analysis with zero false-positive risk.
 */
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import { noHeavyImportOnlyInHandler } from '../rules/performance/no-heavy-import-only-in-handler'
import { lintFile } from '../runner'

const RULE = 'pyreon/no-heavy-import-only-in-handler'

/** Isolated: only this rule, default config. */
function lintOne(source: string, filePath = 'src/comp.tsx') {
  return lintFile(filePath, source, [noHeavyImportOnlyInHandler], {
    rules: { [RULE]: 'warn' },
  }).diagnostics.map((d) => d.ruleId)
}

/** Preset-wired: proves the rule ships in `recommended`. */
function lintPreset(source: string, filePath = 'src/comp.tsx') {
  return lintFile(filePath, source, allRules, getPreset('recommended')).diagnostics.map(
    (d) => d.ruleId,
  )
}

describe('pyreon/no-heavy-import-only-in-handler — FIRES', () => {
  it('heavy import used only in a JSX onClick handler', () => {
    const src = `
import { renderChart } from '@pyreon/charts'
export function Btn() {
  return <button onClick={() => renderChart(el)}>chart</button>
}`
    expect(lintOne(src)).toContain(RULE)
  })

  it('heavy import used only in an onMount callback', () => {
    const src = `
import { mountEditor } from '@pyreon/code'
export function Ed() {
  onMount(() => { mountEditor(ref) })
  return <div />
}`
    expect(lintOne(src)).toContain(RULE)
  })

  it('namespace import touched only in a handler', () => {
    const src = `
import * as flow from '@pyreon/flow'
export function F() {
  return <button onClick={() => flow.create()}>x</button>
}`
    expect(lintOne(src)).toContain(RULE)
  })

  it('default import used only in a handler', () => {
    const src = `
import Doc from '@pyreon/document'
export function D() {
  return <button onClick={() => Doc.render()}>x</button>
}`
    expect(lintOne(src)).toContain(RULE)
  })

  it('all named locals handler-only → one report', () => {
    const src = `
import { a, b } from '@pyreon/charts'
export function C() {
  return <button onClick={() => { a(); b() }}>x</button>
}`
    expect(lintOne(src).filter((r) => r === RULE)).toHaveLength(1)
  })

  it('is wired into the recommended preset', () => {
    const src = `
import { renderChart } from '@pyreon/charts'
export function Btn() {
  return <button onClick={() => renderChart(el)}>c</button>
}`
    expect(lintPreset(src)).toContain(RULE)
  })

  it('custom heavyModules option extends detection', () => {
    const src = `
import { init } from 'echarts'
export function E() {
  return <button onClick={() => init(el)}>x</button>
}`
    const diags = lintFile('src/e.tsx', src, [noHeavyImportOnlyInHandler], {
      rules: { [RULE]: ['warn', { heavyModules: ['echarts'] }] },
    }).diagnostics.map((d) => d.ruleId)
    expect(diags).toContain(RULE)
  })
})

describe('pyreon/no-heavy-import-only-in-handler — DOES NOT FIRE (conservative)', () => {
  it('heavy import used at render (must stay static)', () => {
    const src = `
import { Chart } from '@pyreon/charts'
export function C() {
  return <Chart data={data()} />
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('heavy import used at render AND in a handler — eager use suppresses', () => {
    const src = `
import { Chart, refresh } from '@pyreon/charts'
export function C() {
  return <Chart data={data()} onClick={() => refresh()} />
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('heavy import used in a plain helper called at render (eager, conservative)', () => {
    const src = `
import { renderChart } from '@pyreon/charts'
function draw() { renderChart(el) }
export function C() {
  draw()
  return <div />
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('non-heavy import used only in a handler', () => {
    const src = `
import { clsx } from 'clsx'
export function C() {
  return <button onClick={() => clsx('a')}>x</button>
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('heavy import unused (not this rule’s concern)', () => {
    const src = `
import { Chart } from '@pyreon/charts'
export function C() { return <div /> }`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('type-only heavy import carries no runtime cost', () => {
    const src = `
import type { ChartOptions } from '@pyreon/charts'
export function C(o: ChartOptions) {
  return <button onClick={() => use(o)}>x</button>
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('inline `import { type X }` specifier is not a runtime binding', () => {
    const src = `
import { type ChartOptions, Chart } from '@pyreon/charts'
export function C(o: ChartOptions) {
  return <Chart opts={o} />
}`
    // `Chart` is used at render → eager → no fire; `ChartOptions` is type-only.
    expect(lintOne(src)).not.toContain(RULE)
  })
})

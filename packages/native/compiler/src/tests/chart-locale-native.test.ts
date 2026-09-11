import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PLOT_UNLOWERED_PROPS } from '../chart-hosts'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  swiftChartAugmentation,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'

const SRC = `import { PlotChart, line } from '@pyreon/charts/plot'
interface Row { at: number; value: number }
const ROWS: Row[] = [{ at: 0, value: 1234.5 }]
export function App() {
  return <PlotChart data={ROWS} xValue={(d) => d.at} xTime marks={[line((d) => d.value)]} locale="de-DE" height={200} />
}`

const EXPLICIT = `import { PlotChart, compact, line } from '@pyreon/charts/plot'
interface Row { at: number; value: number }
const ROWS: Row[] = [{ at: 0, value: 1234.5 }]
export function App() {
  return <PlotChart data={ROWS} xValue={(d) => d.at} xTime marks={[line((d) => d.value)]} locale="de-DE" format={compact} xFormat={compact} />
}`

describe('PlotChart locale crosses to native platform formatters', () => {
  it('keeps one Swift declaration per locale helper in the real-engine stub bundle', () => {
    const augmentation = swiftChartAugmentation('PyreonChartCanvas(')
    expect(augmentation.match(/public func pyreonLocaleNumberFormatter/g)).toHaveLength(1)
    expect(augmentation.match(/public func pyreonLocaleDateFormatter/g)).toHaveLength(1)
  })

  it('Swift lowers number and UTC date formatting without a warning', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let pyreonLocale: String = "de-DE"')
    expect(r.code).toContain('yFormat: pyreonLocaleNumberFormatter(pyreonLocale)')
    expect(r.code).toContain('xFormat: pyreonLocaleDateFormatter(pyreonLocale)')
  })

  it('Kotlin lowers the same formatter precedence', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val pyreonLocale: String = "de-DE"')
    expect(r.code).toContain('yFormat = pyreonLocaleNumberFormatter(pyreonLocale)')
    expect(r.code).toContain('xFormat = pyreonLocaleDateFormatter(pyreonLocale)')
  })

  it('locale is no longer classified as an unlowered PlotChart prop', () => {
    expect(PLOT_UNLOWERED_PROPS).not.toContain('locale')
  })

  it('explicit y and x formatters win over locale on both targets', () => {
    const swift = transform(EXPLICIT, { target: 'swift' }).code
    const kotlin = transform(EXPLICIT, { target: 'kotlin' }).code
    expect(swift).toContain('yFormat: compact')
    expect(swift).toContain('xFormat: compact')
    expect(kotlin).toContain('yFormat = ::compact')
    expect(kotlin).toContain('xFormat = ::compact')
  })

  it.skipIf(!isSwiftUIAvailable())(
    'swiftc accepts the emitted chart with the real canvas and engine',
    () => {
      const r = transform(SRC, { target: 'swift' })
      const v = validateSwiftTypecheck(
        read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + r.code,
      )
      expect(v.ok, v.error ?? '').toBe(true)
    },
  )

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the emitted chart', () => {
    const v = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

// A native chart speaks the app's language (#4832).
//
// The web host takes its description / table / announcement words from
// `ChartMessages` (a `registerLocale` pack or the `messages` prop). The engine
// that builds those sentences crosses to Swift and Kotlin, so the `messages`
// prop must cross too: VoiceOver / TalkBack read the same description, the
// data view the same headers and close button, and an untitled family chart
// the app's word instead of "Pie chart".
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin } from './charts-plugin'
import { isKotlincAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'

const APP = `import { PieChart, PlotChart, bars, log } from '@pyreon/charts/engine'
import type { ChartMessages } from '@pyreon/charts/engine'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Led', v: 10 }, { m: 'Úno', v: 30 }]
const CS: ChartMessages = { untitled: 'Graf', category: 'Kategorie', rising: 'roste', close: 'Zavřít', scaleNote: ' Osa {axis} je v měřítku {scale}.', valueAxis: 'hodnot' }
// The mark kind and the change's sign in Czech; the digits come from locale (#4832 follow-up).
const CS_KINDS: ChartMessages = { kindBars: 'sloupce', percent: '{n} %', multiple: '{n}×', valueLabel: 'Hodnota' }
export function App() {
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { label: 'Prodej' })]} title="Prodej" yScale="log" toolbox={{ dataView: true }} messages={CS} height={200} />
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v)]} messages={{ category: 'Den' }} height={200} />
      <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.m} messages={CS} height={200} />
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { label: 'Prodej' })]} title="Kurz" locale="cs-CZ" messages={CS_KINDS} height={200} />
    </Stack>
  )
}
`

describe('the `messages` prop crosses to Swift', () => {
  const r = transform(APP, { target: 'swift' })
  it('emits with no warnings', () => {
    expect(r.warnings).toEqual([])
  })
  it('the description, the scale note and the data view read the chart\'s messages', () => {
    expect(r.code).toContain('let pyreonChartMessages: ChartMessages = CS')
    expect(r.code).toMatch(/describeChart\(A11yInput\(title: "Prodej", [^\n]*, messages: pyreonChartMessages\)\) \+ \/\*scale-note\*\/scaleNoteText\("log", "", pyreonChartMessages\)/)
    expect(r.code).toContain('Button(pyreonChartMessages.close ?? "Close")')
    expect(r.code).toMatch(/let pyreonChartMessages: ChartMessages = ChartMessages\(category: "Den"\)/)
  })
  it('an untitled family chart is named by `messages.untitled`', () => {
    expect(r.code).toContain('.accessibilityLabel(((CS).untitled ?? "Pie chart"))')
  })
  it('a chart with `locale` hands the engine the locale\'s digits for the change and the counts', () => {
    expect(r.code).toMatch(/describeChart\(A11yInput\(title: "Kurz", [^\n]*, messages: pyreonChartMessages, number: pyreonLocaleNumberFormatter\(pyreonLocale\)\)\)/)
  })
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts the emit', () => {
    const v = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

describe('the `messages` prop crosses to Kotlin', () => {
  const r = transform(APP, { target: 'kotlin' })
  it('emits with no warnings', () => {
    expect(r.warnings).toEqual([])
  })
  it('the description, the scale note and the data view read the chart\'s messages', () => {
    expect(r.code).toContain('val pyreonChartMessages: ChartMessages = CS')
    expect(r.code).toMatch(/describeChart\(A11yInput\(title = "Prodej", [^\n]*, messages = pyreonChartMessages\)\) \+ \/\*scale-note\*\/scaleNoteText\("log", "", pyreonChartMessages\)/)
    expect(r.code).toContain('Text(pyreonChartMessages.close ?: "Close"')
  })
  it('an untitled family chart is named by `messages.untitled`', () => {
    expect(r.code).toContain('contentDescription = ((CS).untitled ?: "Pie chart")')
  })
  it('a chart with `locale` hands the engine the locale\'s digits for the change and the counts', () => {
    expect(r.code).toMatch(/describeChart\(A11yInput\(title = "Kurz", [^\n]*, messages = pyreonChartMessages, number = pyreonLocaleNumberFormatter\(pyreonLocale\)\)\)/)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the emit', () => {
    const v = validateKotlin(r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

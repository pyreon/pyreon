// `theme` on a family host, natively. The manifest had claimed
// `theme={chartThemes.dark}` resolves at compile time on every host; it did on
// the plot and frame hosts, and the family + accessor hosts ignored it
// silently — their chrome hardcoded the light theme's colours (the title in
// the LABEL grey, where the web draws it in the TEXT colour), their tooltip
// box came from the default, the theme's palette never reached the options,
// and `theme.background` never painted. All four now follow the theme the
// way the web canvas host does; a host without a theme emits as before,
// except that the title colour is the web's.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const HEAD = `import type { TreeNode } from '@pyreon/charts/plot'
const DATA: TreeNode[] = [{ name: 'src', children: [{ name: 'core', value: 50 }] }, { name: 'docs', value: 30 }]
`
const DARK = `import { TreemapChart, chartThemes } from '@pyreon/charts/plot'
${HEAD}export function Files() {
  return <TreemapChart data={DATA} theme={chartThemes.dark} title="Files" showTitle showLegend tooltip height={200} />
}`
const DARK_OPTS = DARK.replace('theme={chartThemes.dark}', "theme={chartThemes.dark} treemap={{ padding: 2 }}")
const LITERAL = `import { PieChart } from '@pyreon/charts/plot'
interface S { label: string; v: number }
const SL: S[] = [{ label: 'a', v: 3 }, { label: 'b', v: 1 }]
export function Share() {
  return <PieChart data={SL} value={(d: S) => d.v} label={(d: S) => d.label} theme={{ background: '#000000', palette: ['#111111', '#222222'], fontSize: 13 }} showLegend tooltip width={240} height={200} />
}`
const PLAIN = `import { TreemapChart } from '@pyreon/charts/plot'
${HEAD}export function Files() { return <TreemapChart data={DATA} title="Files" showTitle showLegend tooltip height={200} /> }`
const VARIABLE = `import { TreemapChart } from '@pyreon/charts/plot'
import type { ChartTheme } from '@pyreon/charts/plot'
${HEAD}const T: Partial<ChartTheme> = { text: '#ffffff' }
export function Files() { return <TreemapChart data={DATA} theme={T} showLegend height={200} /> }`

const DARK_PALETTE = '"#7b9bff", "#ff8f7e", "#4adbc0", "#bd93ff", "#ffc44d", "#5dcbf2", "#ff80be", "#9ad870", "#a3acbd", "#d8955e"'

describe('family-host theme — chrome, tooltip, palette and ground follow the theme on both targets', () => {
  it('Swift: a named theme colours the title (text) and legend (label), the tooltip box (surface / grid / text), seeds the options palette, and paints the ground', () => {
    const r = transform(DARK, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`let pyreonOptions: TreemapOptions = TreemapOptions(palette: [${DARK_PALETTE}])`)
    expect(r.code).toContain('layoutTreemap(DATA, PyreonChartRect(x: 0.0, y: 0.0, w: Double(pyreonGeo.size.width), h: 200.0), pyreonOptions)')
    expect(r.code).toContain('TitleOptions(fontSize: 15.0, color: "#e6eaf2", align: "start")')
    expect(r.code).toContain('LegendOptions(fontSize: 11.0, labelColor: "#9aa5b5",')
    expect(r.code).toContain('TooltipOptions(fontSize: 11.0, fill: "#1c2230", border: "rgba(154,165,181,0.16)", text: "#e6eaf2", pad: 8.0, radius: 4.0)')
    expect(r.code).toContain('.background(pyreonChartColor("#141821"))')
    // The entrance copy is taken from the palette-seeded options, so both reach the render.
    expect(r.code).toContain('var pyreonO = pyreonOptions; pyreonO.progress = pyreonEntrance')
  })
  it('Kotlin: the same shape — the ground is a Box around the host', () => {
    const r = transform(DARK, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`val pyreonOptions: TreemapOptions = TreemapOptions(palette = listOf(${DARK_PALETTE}))`)
    expect(r.code).toContain('TitleOptions(fontSize = 15.0, color = "#e6eaf2", align = "start")')
    expect(r.code).toContain('LegendOptions(fontSize = 11.0, labelColor = "#9aa5b5",')
    expect(r.code).toContain('TooltipOptions(fontSize = 11.0, fill = "#1c2230", border = "rgba(154,165,181,0.16)", text = "#e6eaf2", pad = 8.0, radius = 4.0)')
    expect(r.code).toContain('Box(modifier = Modifier.background(pyreonChartColor("#141821"))) {')
  })
  it('an explicit palette in the options wins over the theme; the theme fills it only when unset', () => {
    const s = transform(DARK_OPTS, { target: 'swift' })
    expect(s.code).toContain('let pyreonOptions: TreemapOptions = { () -> TreemapOptions in var pyreonO = TreemapOptions(padding: Double(2)); if pyreonO.palette == nil { pyreonO.palette = [')
    const k = transform(DARK_OPTS, { target: 'kotlin' })
    expect(k.code).toContain('val pyreonOptions: TreemapOptions = (TreemapOptions(padding = (2).toDouble())).let { if (it.palette == null) it.copy(palette = listOf(')
  })
  it('an accessor host: a literal theme drives the slice colours by index, the pie label size and the ground', () => {
    const s = transform(LITERAL, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).toContain('color: ["#111111", "#222222"][pyreonI % ["#111111", "#222222"].count]')
    expect(s.code).toContain('fontSize: 13.0)')
    expect(s.code).toContain('.background(pyreonChartColor("#000000"))')
    const k = transform(LITERAL, { target: 'kotlin' })
    expect(k.code).toContain('color = listOf("#111111", "#222222")[pyreonI % listOf("#111111", "#222222").size]')
    expect(k.code).toContain('Box(modifier = Modifier.background(pyreonChartColor("#000000"))) {')
  })
  it('without a theme nothing is added: no ground, no palette seed, the default tooltip — and the title in the web\'s text colour', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(PLAIN, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('pyreonChartColor(')
      expect(r.code).not.toContain('pyreonOptions')
      expect(r.code).toContain(target === 'swift' ? 'color: "#1f2937", align: "start"' : 'color = "#1f2937", align = "start"')
      expect(r.code).toContain(target === 'swift' ? 'fill: "#ffffff", border: "rgba(132,150,165,0.18)", text: "#1f2937"' : 'fill = "#ffffff", border = "rgba(132,150,165,0.18)", text = "#1f2937"')
    }
  })
  it('a non-literal theme is reported ONCE per host (the fields are read once and shared), and the default applies', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(VARIABLE, { target })
      expect(r.warnings).toEqual(['<TreemapChart theme>: only an object literal with literal fields lowers on native; the default theme applies.'])
      expect(r.code).not.toContain('pyreonChartColor(')
    }
  })
  const fixtures = { DARK, DARK_OPTS, LITERAL, PLAIN }
  it('swiftc accepts the themed hosts (the ground modifier, the palette copy, the colour parser)', { skip: !isSwiftcAvailable() }, () => {
    for (const [name, src] of Object.entries(fixtures)) {
      const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(r.ok, `${name}: ${r.error ?? ''}`).toBe(true)
    }
  })
  it('kotlinc accepts the themed hosts', { skip: !isKotlincAvailable() }, () => {
    for (const [name, src] of Object.entries(fixtures)) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.ok, `${name}: ${r.error ?? ''}`).toBe(true)
    }
  })
})

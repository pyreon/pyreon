import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — charts snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/charts — Pyreon's own charting engine: marks as JSX children, typed channels, canvas and SVG, the same chart on the web, iOS and Android. \`@pyreon/charts\` is the stable surface: \`<Chart>\`, its marks, the family components, formatters, theme and linking. \`/svg\` renders charts to SVG strings with no DOM. \`/engine\` exports every layout, hit test and draw-list builder for building on the engine, and is not covered by the stability promise."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/charts — Charts on web, iOS and Android

      \`<Chart>\` takes your rows and marks as children — \`<Bar y="revenue">\`, \`<Line>\`, \`<Area>\`, \`<Dot>\`, \`<Arc>\` for a pie, \`<Stage>\` for a funnel. Channels are field names checked against the row — \`<Chart<Row>>\` checks its own, and a mark given the row type (\`<Bar<Row> y="revenue">\`) checks its own too; axes, palette, tooltip, an accessible data table and a spoken description come for free. The geometry is pure TypeScript over a flat draw list, which is what makes the same source render on canvas, as an SVG string on a server, and natively on iOS and Android (the draw list is generated into the Swift and Kotlin runtimes). Every mark and chart family is an imported binding, so a bundle carries only what it draws. Entries: \`@pyreon/charts\` (the stable surface), \`/svg\` (SSR and export) and \`/engine\` (every layout, hit test and draw-list builder; not covered by the stability promise).

      \`\`\`typescript
      import { Arc, Axis, Bar, Chart, Legend, Line, Rule, Tooltip, currency } from '@pyreon/charts'
      import { signal } from '@pyreon/reactivity'

      interface Row { month: string; revenue: number; target: number }
      const rows = signal<Row[]>([
        { month: 'Jan', revenue: 120, target: 100 },
        { month: 'Feb', revenue: 160, target: 140 },
        { month: 'Mar', revenue: 150, target: 170 },
      ])

      // Marks are children; channels are field names, typed against Row.
      <Chart data={rows} x="month" height={320}>
        <Bar y="revenue" label="Revenue" />
        <Line y="target" label="Target" />
        <Rule y={130} label="Break-even" />
        <Axis y format={currency('EUR')} />
        <Tooltip />
        <Legend position="bottom" />
      </Chart>

      // A family is a mark in the same grammar: this is a donut.
      <Chart data={rows} height={240}>
        <Arc value="revenue" label="month" innerRadius={0.6} />
      </Chart>

      // Writing the signal repaints the canvas in place.
      rows.set([...rows(), { month: 'Apr', revenue: 190, target: 180 }])
      \`\`\`

      > **Which entry**: \`@pyreon/charts\` is the stable surface: \`<Chart>\`, its marks, the family components, formatters, theme and linking. \`/svg\` renders charts to SVG strings with no DOM. \`/engine\` exports every layout, hit test and draw-list builder for building on the engine, and is not covered by the stability promise.
      >
      > **A non-finite value is a GAP, everywhere**: In \`@pyreon/charts\`, NaN AND Infinity are gaps: they are dropped from every domain (\`extent\`, the auto axis, the parallel/calendar/boxplot/histogram domains), draw as nothing (a zero-height bar at the zero line, a break in a line, an absent parallel segment), are absent from the tooltip and the accessible table, and are silence in \`sonifyValues\`. \`makeTicks\` returns ZERO ticks for a non-finite BOUND rather than a thousand NaN labels. \`isFiniteNumber\` is the engine's predicate and is exported — it is written in the native subset (\`v === v && v - v === 0\`) because \`Number.isFinite\` has no lowering inside the crossing engine, and it is what a custom mark or family should use so its gaps match the built-ins'.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(17)
  })
})

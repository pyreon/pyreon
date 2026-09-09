// A theme field that is a LIST used to mean `palette`, because palette was the
// only one. When `ramp` joined (the value ramp for calendar/heatmap/geo), the
// `strings` branch of `chartThemeFields` still read `palette` unconditionally,
// so a native calendar emitted the CATEGORICAL palette as its value ramp — ten
// unordered hues where a four-stop ordered ramp belongs. It typechecked, it
// compiled, and every suite stayed green; only reading the emit showed it.
//
// The override loop had the mirror bug: it `continue`d on every `strings` field
// so a user's `theme={{ ramp: [...] }}` was dropped with no warning at all.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { CHART_THEMES } from '../chart-hosts'

const emit = (jsx: string): { code: string; warnings: string[] } => {
  const r = transform(
    `import { CalendarChart } from '@pyreon/charts/plot'\nconst v = {}\nexport function C() { return ${jsx} }`,
    { filename: 'C.tsx', target: 'swift' },
  )
  return { code: r.code, warnings: [...r.warnings] }
}
const stopsArg = (code: string): string =>
  /stops: (\([^)]*\)|\[[^\]]*\])/.exec(code.split('\n').find((l) => l.includes('CalendarOptions(')) ?? '')?.[1] ?? ''

describe('list-valued theme fields lower per FIELD, not as the palette', () => {
  it('a calendar emits the value ramp, not the categorical palette', () => {
    const arg = stopsArg(emit('<CalendarChart start="a" end="b" values={v} />').code)
    for (const stop of CHART_THEMES.light.ramp as readonly string[]) expect(arg).toContain(stop)
    for (const stop of CHART_THEMES.dark.ramp as readonly string[]) expect(arg).toContain(stop)
    // The discriminating half: the palette's own colours must NOT appear. Both
    // lists are arrays of hex strings, so "contains an array" proves nothing.
    for (const c of CHART_THEMES.light.palette as readonly string[]) expect(arg).not.toContain(c)
  })

  it('the ramp still follows the runtime colour scheme', () => {
    expect(stopsArg(emit('<CalendarChart start="a" end="b" values={v} />').code)).toContain('pyreonColorScheme == .dark')
  })

  it('an explicit literal ramp wins, and pins the scheme switch off', () => {
    const arg = stopsArg(emit(`<CalendarChart start="a" end="b" values={v} theme={{ ramp: ['#111111', '#222222'] }} />`).code)
    expect(arg).toBe(`["#111111", "#222222"]`)
    expect(arg).not.toContain('pyreonColorScheme')
  })

  it('a non-literal ramp WARNS by name instead of being dropped', () => {
    const r = emit('<CalendarChart start="a" end="b" values={v} theme={{ ramp: nope }} />')
    expect(r.warnings.join('\n')).toContain('`ramp` must be an array of string literals on native')
    // …and the default still applies, so the chart renders.
    expect(stopsArg(r.code)).toContain((CHART_THEMES.light.ramp as readonly string[])[0]!)
  })
})

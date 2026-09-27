import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * A timeline OptionChart on native: every static step lowers to its own host,
 * and the current one shows over the engine's strip — checkpoints, play /
 * previous / next, `loop` / `rewind` auto-play — instead of one frozen step.
 * A pinned `timelineIndex` still renders exactly that step.
 */
describe.each(['swift', 'kotlin'] as const)('OptionChart timeline on %s', (target) => {
  const check = (code: string) => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(code)).toMatchObject({ ok: true })
  }
  const option = `{ baseOption: { timeline: { data: ['2019', '2020', '2021'], autoPlay: true, loop: false, playInterval: 800, controlStyle: { showPrevBtn: false } }, xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar' }] }, options: [{ series: [{ data: [1, 2] }] }, { series: [{ data: [3, 4] }] }, { series: [{ data: [5, 6] }] }] }`

  it('every step lowers under a tappable, auto-playing strip', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={${option}} height={260} data-testid="tl" />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('renderTimeline(')
    expect(r.code).toContain('timelineHit(')
    expect(r.code).toContain('timelineTick(')
    expect(r.code.match(/"2021"/g)?.length).toBeGreaterThanOrEqual(1)
    expect(r.code).toMatch(/showPrev ?[:=] ?false/)
    expect(r.code).toMatch(/loop ?[:=] ?false/)
    check(r.code)
  })

  it('a pinned timelineIndex renders that one step, with no strip', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={${option}} timelineIndex={2} height={260} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).not.toContain('renderTimeline(')
    check(r.code)
  })
})

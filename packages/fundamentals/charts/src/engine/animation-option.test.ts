import { describe, expect, it } from 'vitest'
import { ECHARTS_ANIMATION_DEFAULTS, resolveAnimation } from './animation-option'
import { compileOption } from './option'
import { compileFamily } from './option-family'

const collect = (option: Record<string, unknown>) => {
  const warnings: string[] = []
  const a = resolveAnimation(option, (_c, path) => warnings.push(path))
  return { a, warnings }
}

describe('resolveAnimation — ECharts animation semantics', () => {
  it('defaults to ECharts: 1000 ms cubicOut entrance, 300 ms cubicInOut update', () => {
    expect(resolveAnimation({})).toEqual(ECHARTS_ANIMATION_DEFAULTS)
    expect(ECHARTS_ANIMATION_DEFAULTS).toMatchObject({ enter: true, enterMs: 1000, enterEasing: 'cubicOut', update: true, updateMs: 300, updateEasing: 'cubicInOut' })
  })
  it('`animation: false` turns off both the entrance and the update', () => {
    expect(resolveAnimation({ animation: false })).toMatchObject({ enter: false, update: false })
  })
  it('reads durations, delays and easings from the option', () => {
    const a = resolveAnimation({ animationDuration: 500, animationDelay: 50, animationEasing: 'bounceOut', animationDurationUpdate: 120, animationDelayUpdate: 10, animationEasingUpdate: 'linear' })
    expect(a).toMatchObject({ enterMs: 500, enterDelay: 50, enterEasing: 'bounceOut', updateMs: 120, updateDelay: 10, updateEasing: 'linear' })
  })
  it('a series value wins over the option value', () => {
    expect(resolveAnimation({ animationDuration: 500, series: [{ animationDuration: 200 }] }).enterMs).toBe(200)
    expect(resolveAnimation({ series: [{ animation: false }] })).toMatchObject({ enter: false, update: false })
  })
  it('series that disagree are named; the first wins', () => {
    const { a, warnings } = collect({ series: [{ animationDuration: 200 }, { animationDuration: 800 }] })
    expect(a.enterMs).toBe(200)
    expect(warnings).toEqual(['series[0].animationDuration'])
  })
  it('a series longer than animationThreshold (default 2000) is not animated', () => {
    expect(resolveAnimation({ series: [{ data: Array.from({ length: 2001 }, () => 1) }] })).toMatchObject({ enter: false, update: false })
    expect(resolveAnimation({ series: [{ data: Array.from({ length: 2000 }, () => 1) }] })).toMatchObject({ enter: true, update: true })
    expect(resolveAnimation({ animationThreshold: 3, series: [{ data: [1, 2, 3, 4] }] })).toMatchObject({ enter: false })
  })
  it('a zero duration turns that animation off', () => {
    expect(resolveAnimation({ animationDuration: 0 })).toMatchObject({ enter: false, update: true })
    expect(resolveAnimation({ animationDurationUpdate: 0 })).toMatchObject({ enter: true, update: false })
  })
  it('a per-datum function or a bad value is named and falls back', () => {
    const { a, warnings } = collect({ animationDelay: (i: number) => i * 10, animationDuration: -5, animationEasing: 'wobble' })
    expect(a).toMatchObject({ enterDelay: 0, enterMs: 1000, enterEasing: 'cubicOut' })
    expect(warnings.sort()).toEqual(['animationDelay', 'animationDuration', 'animationEasing'])
  })
  it('both compile paths carry the resolved animation and raise no generic "no mapping" warning for its keys', () => {
    const cart = compileOption({ animation: false, animationDuration: 400, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1], animationEasing: 'linear' }] })
    expect(cart.animation).toMatchObject({ enter: false, update: false, enterMs: 400, enterEasing: 'linear' })
    expect(cart.warnings.filter((w) => w.path.includes('animation'))).toEqual([])
    const fam = compileFamily({ animationDurationUpdate: 90, series: [{ type: 'pie', data: [{ name: 'a', value: 1 }], animation: false }] })!
    expect(fam.animation).toMatchObject({ enter: false, update: false, updateMs: 90 })
    expect(fam.warnings.filter((w) => w.path.includes('animation'))).toEqual([])
  })
})

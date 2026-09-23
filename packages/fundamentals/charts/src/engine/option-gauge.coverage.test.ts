/**
 * readGaugeDial's key readers on the shapes option-gauge.test.ts leaves out:
 * transparent detail backgrounds, unparseable lengths, formatter functions
 * returning nothing, the axis line colour's other forms, the detail padding's
 * forms, a scalar `data`, and the label-rotate / detail colour / weight keys.
 */
import { describe, expect, it } from 'vitest'
import { gaugeText, readDialLen, readGaugeDial } from './option-gauge'

const FALLBACK = { v: 3, pct: true }

describe('readDialLen fallbacks', () => {
  it('a percent or pixel string that is not a number keeps the fallback', () => {
    expect(readDialLen('abc%', FALLBACK)).toBe(FALLBACK)
    expect(readDialLen('wide', FALLBACK)).toBe(FALLBACK)
    expect(readDialLen(Number.NaN, FALLBACK)).toBe(FALLBACK)
    expect(readDialLen(' 40% ', FALLBACK)).toEqual({ v: 0.4, pct: true })
  })
})

describe('gaugeText', () => {
  it('a formatter function returning nothing prints nothing; a value prints as a string', () => {
    expect(gaugeText(5, () => undefined)).toBe('')
    expect(gaugeText(5, () => null)).toBe('')
    expect(gaugeText(5, (v: unknown) => (v as number) * 2)).toBe('10')
    expect(gaugeText(5, undefined)).toBe('5')
  })
})

describe('readGaugeDial axis line and detail box', () => {
  it('a single colour string is one band; junk or no valid entries fall back to the token band', () => {
    expect(readGaugeDial({ axisLine: { lineStyle: { color: '#f00' } } }, []).stops).toEqual([{ at: 1, color: '#f00' }])
    expect(readGaugeDial({ axisLine: { lineStyle: { color: 42 } } }, []).stops).toEqual([{ at: 1, color: '#e8ebf0' }])
    expect(readGaugeDial({ axisLine: { lineStyle: { color: [['x', '#f00'], [0.5]] } } }, []).stops).toEqual([{ at: 1, color: '#e8ebf0' }])
  })

  it('a transparent detail background draws no box fill; an opaque one does', () => {
    for (const bg of ['transparent', 'none', 'rgba(0, 0, 0, 0)']) {
      expect(readGaugeDial({ detail: { backgroundColor: bg } }, []).detailBg).toBe('')
    }
    expect(readGaugeDial({ detail: { backgroundColor: 'rgba(0, 0, 0, 0.5)' } }, []).detailBg).toBe('rgba(0, 0, 0, 0.5)')
    expect(readGaugeDial({ detail: { backgroundColor: '#fafafa' } }, []).detailBg).toBe('#fafafa')
  })

  it('detail padding: one number, [v, h], [t, r, b, l]; anything else keeps the default', () => {
    const pad = (p: unknown): number[] => readGaugeDial({ detail: { padding: p } }, []).detailPadding
    expect(pad(4)).toEqual([4, 4, 4, 4])
    expect(pad([2, 6])).toEqual([2, 6, 2, 6])
    expect(pad([1, 2, 3, 4])).toEqual([1, 2, 3, 4])
    expect(pad([1, 2, 3])).toEqual([5, 10, 5, 10])
    expect(pad([1, 'x'])).toEqual([5, 10, 5, 10])
  })

  it('detail height takes height, then lineHeight, else one line of the font', () => {
    expect(readGaugeDial({ detail: { height: 20, lineHeight: 40 } }, []).detailHeight).toBe(20)
    expect(readGaugeDial({ detail: { lineHeight: 40 } }, []).detailHeight).toBe(40)
    expect(readGaugeDial({}, []).detailHeight).toBe(-1)
  })

  it("detail colour 'auto' and 'inherit' defer to the dial; a colour is kept", () => {
    expect(readGaugeDial({ detail: { color: 'auto' } }, []).detailColor).toBe('')
    expect(readGaugeDial({ detail: { color: 'inherit' } }, []).detailColor).toBe('')
    expect(readGaugeDial({ detail: { color: '#123' } }, []).detailColor).toBe('#123')
  })

  it('detail weight: bold by default, a numeric weight of 600+ is bold, lighter is not', () => {
    expect(readGaugeDial({ detail: { fontWeight: 700 } }, []).detailBold).toBe(true)
    expect(readGaugeDial({ detail: { fontWeight: 600 } }, []).detailBold).toBe(true)
    expect(readGaugeDial({ detail: { fontWeight: 400 } }, []).detailBold).toBe(false)
    expect(readGaugeDial({ detail: { fontWeight: 'normal' } }, []).detailBold).toBe(false)
  })

  it('a hidden detail blanks every datum\'s detail text', () => {
    const d = readGaugeDial({ detail: { show: false }, data: [{ value: 9 }] }, [])
    expect(d.detailShow).toBe(false)
    expect(d.data[0]!.detail).toBe('')
  })
})

describe('readGaugeDial data and labels', () => {
  it('a scalar or single-object data is one datum; absent data is none', () => {
    expect(readGaugeDial({ data: 33 }, []).data.map((d) => d.value)).toEqual([33])
    expect(readGaugeDial({ data: { value: 12, name: 'x' } }, []).data.map((d) => [d.value, d.name])).toEqual([[12, 'x']])
    expect(readGaugeDial({}, []).data).toEqual([])
  })

  it('a missing value sits at the minimum with an empty detail; plain numbers read as values', () => {
    const d = readGaugeDial({ min: 10, data: [{ name: 'none' }, 25] }, [])
    expect(d.data[0]).toMatchObject({ value: 10, detail: '' })
    expect(d.data[1]).toMatchObject({ value: 25, detail: '25' })
    // A scalar that is not a number is a datum with no value, too.
    expect(readGaugeDial({ min: 3, data: ['x'] }, []).data[0]).toMatchObject({ value: 3, detail: '' })
  })

  it('colours cycle through the palette by index; the series itemStyle beats the palette', () => {
    expect(readGaugeDial({ data: [1, 2, 3] }, ['#a', '#b']).data.map((d) => d.color)).toEqual(['#a', '#b', '#a'])
    expect(readGaugeDial({ itemStyle: { color: '#c' }, data: [1, 2] }, ['#a']).data.map((d) => d.color)).toEqual(['#c', '#c'])
  })

  it('per-datum pointer and progress colours beat the series ones', () => {
    const d = readGaugeDial({
      pointer: { itemStyle: { color: '#p' } },
      progress: { itemStyle: { color: '#q' } },
      data: [{ value: 1, pointer: { itemStyle: { color: '#pp' } }, progress: { itemStyle: { color: '#qq' } } }, 2],
    }, [])
    expect(d.data.map((x) => [x.pointerColor, x.progressColor])).toEqual([['#pp', '#qq'], ['#p', '#q']])
  })

  it('label rotate: radial and tangential pass through, a number is fixed, zero or junk is upright', () => {
    const rot = (r: unknown): [string, number] => {
      const d = readGaugeDial({ axisLabel: { rotate: r } }, [])
      return [d.labelRotate, d.labelDegrees]
    }
    expect(rot('radial')).toEqual(['radial', 0])
    expect(rot('tangential')).toEqual(['tangential', 0])
    expect(rot(30)).toEqual(['fixed', 30])
    expect(rot(0)).toEqual(['', 0])
    expect(rot('sideways')).toEqual(['', 0])
  })

  it("an 'auto' label colour defers to the axis band", () => {
    expect(readGaugeDial({ axisLabel: { color: 'auto' } }, []).labelColor).toBe('')
    expect(readGaugeDial({ axisLabel: { color: '#321' } }, []).labelColor).toBe('#321')
  })

  it('without a warn callback an undrawable icon still falls back silently', () => {
    const d = readGaugeDial({ pointer: { icon: 'path://M0 0' }, anchor: { icon: 'image://a.png' } }, [])
    expect(d.pointerIcon).toBe('')
    expect(d.anchorIcon).toBe('circle')
  })

  it('an anticlockwise dial and the progress / anchor switches', () => {
    const d = readGaugeDial({ clockwise: false, progress: { show: true, overlap: false, clip: false, roundCap: true }, anchor: { show: true, showAbove: true } }, [])
    expect(d).toMatchObject({ clockwise: false, progressShow: true, progressOverlap: false, progressClip: false, progressRound: true, anchorShow: true, anchorAbove: true })
  })
})

describe('the gauge dial through the option pipeline', () => {
  it('names an unsupported pointer icon as a series warning instead of dropping it silently', async () => {
    const { compileFamily } = await import('./option-family')
    const f = compileFamily({ series: [{ type: 'gauge', pointer: { icon: 'image://needle.png' }, data: [{ value: 40 }] }] })!
    const w = f.warnings.find((x) => x.path === 'series[0].pointer.icon')
    expect(w?.code).toBe('series-option-unsupported')
    expect(w?.message).toContain('image://needle.png')
  })

  it('a supported icon raises no warning', async () => {
    const { compileFamily } = await import('./option-family')
    const f = compileFamily({ series: [{ type: 'gauge', pointer: { icon: 'arrow' }, data: [{ value: 40 }] }] })!
    expect(f.warnings.some((x) => x.path === 'series[0].pointer.icon')).toBe(false)
  })
})

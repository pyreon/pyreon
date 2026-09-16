// ECharts' series `label` formatter, on the arms the segmentation suite next
// door does not drive: the function form, a non-string non-function, the
// unsupported placeholders, rich styles with unknown keys, and data whose
// categories run shorter than its values. Each of these is authored config,
// so each is reachable, and every loss must be NAMED rather than silent.
import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import type { EChartsOption } from './option'

const compiled = (label: Record<string, unknown>, data: number[] = [30, 70], categories: string[] = ['Mon', 'Tue']) =>
  compileOption({
    xAxis: { type: 'category', data: categories },
    yAxis: {},
    series: [{ type: 'bar', name: 'Sales', data, label: { show: true, ...label } }],
  } as EChartsOption)

const texts = (label: Record<string, unknown>, data?: number[], categories?: string[]) =>
  compiled(label, data, categories).spec.series[0]!.labelTexts

const warned = (label: Record<string, unknown>, fragment: string) =>
  compiled(label).warnings.some((w) => w.message.includes(fragment))

describe('label.formatter — template form', () => {
  it('substitutes the series name, category, value and share', () => {
    expect(texts({ formatter: '{a}/{b}/{c}/{d}' })).toEqual(['Sales/Mon/30/30', 'Sales/Tue/70/70'])
  })

  it('an unsupported placeholder is NAMED and left as written', () => {
    expect(warned({ formatter: '{b1} {c}' }, '{b1}')).toBe(true)
    expect(texts({ formatter: '{e}' })).toEqual(['{e}', '{e}'])
  })

  it('a category list SHORTER than the data falls back to the index', () => {
    expect(texts({ formatter: '{b}' }, [1, 2, 3], ['only'])).toEqual(['only', '1', '2'])
  })

  it('an all-zero series reports a 0% share rather than NaN', () => {
    expect(texts({ formatter: '{d}' }, [0, 0])).toEqual(['0', '0'])
  })
})

describe('label.formatter — function form', () => {
  it('is called once per datum with the ECharts params shape', () => {
    const calls: unknown[] = []
    const out = texts({
      formatter: (p: { seriesName: string; name: string; value: number; dataIndex: number; percent: number }) => {
        calls.push(p)
        return `${p.seriesName}:${p.name}:${p.value}:${p.dataIndex}:${Math.round(p.percent)}`
      },
    })
    expect(out).toEqual(['Sales:Mon:30:0:30', 'Sales:Tue:70:1:70'])
    expect(calls).toHaveLength(2)
  })

  it('its return is stringified, and a short category list falls back to the index', () => {
    expect(texts({ formatter: (p: { name: string }) => p.name }, [1, 2], ['x'])).toEqual(['x', '1'])
    expect(texts({ formatter: () => 42 })).toEqual(['42', '42'])
  })

  it('an all-zero series hands the function a 0 share rather than NaN', () => {
    const shares: number[] = []
    texts({ formatter: (p: { percent: number }) => { shares.push(p.percent); return '' } }, [0, 0])
    expect(shares).toEqual([0, 0])
  })
})

describe('label.formatter — neither a string nor a function', () => {
  it('is NAMED and ignored, leaving no label texts', () => {
    expect(warned({ formatter: 7 }, 'template string or a function')).toBe(true)
    expect(texts({ formatter: 7 })).toBeUndefined()
  })
})

describe('label.rich', () => {
  it('each named style carries its colour and size', () => {
    const s = compiled({ rich: { hi: { color: '#f00', fontSize: 20 } } }).spec.series[0]!
    expect(s.labelRich).toEqual([{ name: 'hi', color: '#f00', fontSize: 20 }])
  })

  it('a style missing colour or size takes an empty colour and a zero size', () => {
    const s = compiled({ rich: { bare: {} } }).spec.series[0]!
    expect(s.labelRich).toEqual([{ name: 'bare', color: '', fontSize: 0 }])
  })

  it('a NON-object style value is treated as an empty style', () => {
    const s = compiled({ rich: { odd: 'red' } }).spec.series[0]!
    expect(s.labelRich).toEqual([{ name: 'odd', color: '', fontSize: 0 }])
  })

  it('a key with no engine form is NAMED per key', () => {
    const c = compiled({ rich: { hi: { color: '#f00', padding: 4, align: 'left' } } })
    expect(c.warnings.some((w) => w.path.endsWith('.rich.hi.padding'))).toBe(true)
    expect(c.warnings.some((w) => w.path.endsWith('.rich.hi.align'))).toBe(true)
  })

  it('an EMPTY rich object sets no styles at all', () => {
    expect(compiled({ rich: {} }).spec.series[0]!.labelRich).toBeUndefined()
  })
})

describe('label colour and size', () => {
  it('are read when typed correctly, and ignored otherwise', () => {
    const ok = compiled({ color: '#123', fontSize: 14 }).spec.series[0]!
    expect(ok.labelColor).toBe('#123')
    expect(ok.labelSize).toBe(14)
    const bad = compiled({ color: 5, fontSize: 'big' }).spec.series[0]!
    expect(bad.labelColor).toBeUndefined()
    expect(bad.labelSize).toBeUndefined()
  })
})

// The accessible words follow the app's language (#4832).
//
// A chart on a Czech page used to describe itself in English: the canvas
// `aria-label`, the table's `Category` header, the keyboard announcements and
// the derived SVG `<desc>` were literal English, and `locale` formatted the
// numbers only. `ChartMessages` (from a `registerLocale` pack or the
// `messages` prop) carries the words into every one of those surfaces.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { chartTable, describeChart, describeDatum, scaleNoteText, tableCaption } from './a11y'
import type { ChartMessages } from './a11y'
import { tableHtml } from './canvas-host'
import { gaugeToSvg } from './family-svg'
import { Bar, Chart } from './grammar'
import { HeatmapChart } from './HeatmapChart'
import { registerLocale } from './locale'
import { GaugeChart } from './PieChart'
import { chartToSvg } from './svg-chart'
import { bars } from './marks'

const CS: ChartMessages = {
  untitled: 'Graf',
  noData: '{title}: žádná data.',
  overview: '{title}. {series} v {count} kategoriích od {first} do {last}.',
  overviewPlain: '{title}. {series}.',
  oneSeries: '1 řada',
  manySeries: 'řady: {n}',
  empty: '{label}: prázdné.',
  rising: 'roste',
  falling: 'klesá',
  flat: 'beze změny',
  trend: '{label}: {direction}{change} z {first} na {last}, rozsah {low}{lowAt} až {high}{highAt}.',
  at: ' ({category})',
  category: 'Kategorie',
  noValue: 'bez hodnoty',
  datum: '{label}: {value}{at}, {index} z {count}',
  scaleNote: ' Osa {axis} je v měřítku {scale}.',
  valueAxis: 'hodnot',
  truncated: '{title} (prvních {shown} z {total} řádků)',
  close: 'Zavřít',
  gauge: '{title}: {value} z {max}.',
  heatmap: '{title}: {columns} sloupců a {rows} řádků, hodnoty {min} až {max}.',
}

const ENGLISH_WORDS = /series over|categories|rising|ranging|\bof\b|Category/

describe('the engine reads ChartMessages', () => {
  const input = {
    title: 'Prodej',
    categories: ['po', 'út'],
    series: [{ label: 'Prodej', values: [3, 5], kind: 'bars' }],
  }

  it('describeChart, chartTable and describeDatum use the given words', () => {
    const m = { ...input, messages: CS }
    expect(describeChart(m)).toBe('Prodej. 1 řada v 2 kategoriích od po do út. Prodej: roste 67% z 3 na 5, rozsah 3 (po) až 5 (út).')
    expect(chartTable(m).headers).toEqual(['Kategorie', 'Prodej'])
    expect(describeDatum(m, 0, 1)).toBe('Prodej: 5 (út), 2 z 2')
    expect(describeDatum({ ...m, series: [{ label: 'Prodej', values: [NaN], kind: 'bars' }] }, 0, 0)).toBe('Prodej: bez hodnoty (po), 1 z 1')
    expect(describeChart({ ...m, title: undefined, series: [] })).toBe('Graf: žádná data.')
    expect(scaleNoteText('log', 'linear', CS)).toBe(' Osa hodnot je v měřítku log.')
    expect(tableCaption('Prodej', 10, 50, CS)).toBe('Prodej (prvních 10 z 50 řádků)')
  })

  it('no messages: the English sentences are unchanged', () => {
    expect(describeChart(input)).toBe('Prodej. 1 series over 2 categories from po to út. Prodej, bars: rising 67% from 3 to 5, ranging 3 at po to 5 at út.')
    expect(describeChart({ ...input, categories: [] })).toBe('Prodej. 1 series. Prodej, bars: rising 67% from 3 to 5, ranging 3 to 5.')
    expect(chartTable(input).headers[0]).toBe('Category')
    expect(scaleNoteText('log', 'sqrt')).toBe(' The value axis is on a log scale. The x axis is on a sqrt scale.')
    expect(tableHtml({ headers: ['a'], rows: [['1']], total: 3 }, 'T')).toContain('<caption>T (first 1 of 3 rows)</caption>')
  })

  it('unset fields fall back to English one by one', () => {
    expect(chartTable({ ...input, messages: { category: 'Den' } }).headers).toEqual(['Den', 'Prodej'])
    expect(describeChart({ ...input, messages: { rising: 'roste' } })).toContain('Prodej, bars: roste 67% from 3 to 5')
  })
})

describe('the chart components take the words from the locale pack or `messages`', () => {
  const roots: HTMLElement[] = []
  const mountIn = (vnode: ReturnType<typeof h>): HTMLElement => {
    const root = document.createElement('div')
    document.body.append(root)
    roots.push(root)
    mount(vnode, root)
    return root
  }
  afterEach(() => {
    for (const r of roots.splice(0)) r.remove()
  })
  const rows = [{ day: 'po', n: 3 }, { day: 'út', n: 5 }]

  it('<Chart locale> describes itself in the registered pack\'s words (the issue\'s repro)', async () => {
    registerLocale('cs-CZ', { messages: CS })
    const root = mountIn(h(Chart<{ day: string; n: number }>, { data: rows, x: 'day', title: 'Prodej po dnech', locale: 'cs-CZ' }, h(Bar<{ day: string; n: number }>, { y: 'n', label: 'Prodej' })))
    await new Promise((r) => setTimeout(r, 30))
    const label = root.querySelector('canvas')!.getAttribute('aria-label')!
    expect(label).not.toMatch(ENGLISH_WORDS)
    expect(label).toContain('1 řada v 2 kategoriích od po do út')
    expect(root.querySelector('table th')!.textContent).toBe('Kategorie')
  })

  it('the `messages` prop wins over the pack field by field; `description` replaces the sentence', async () => {
    registerLocale('cs-CZ', { messages: CS })
    const a = mountIn(h(Chart<{ day: string; n: number }>, { data: rows, x: 'day', title: 'T', locale: 'cs-CZ', messages: { category: 'Den' } }, h(Bar<{ day: string; n: number }>, { y: 'n', label: 'Prodej' })))
    const b = mountIn(h(Chart<{ day: string; n: number }>, { data: rows, x: 'day', title: 'T', description: (i: { categories: readonly string[] }) => `Vlastní: ${i.categories.length}` }, h(Bar<{ day: string; n: number }>, { y: 'n', label: 'Prodej' })))
    await new Promise((r) => setTimeout(r, 30))
    expect(a.querySelector('table th')!.textContent).toBe('Den')
    expect(a.querySelector('canvas')!.getAttribute('aria-label')).toContain('roste')
    expect(b.querySelector('canvas')!.getAttribute('aria-label')).toBe('Vlastní: 2')
  })

  it('family hosts take `messages`: their own sentence and the table header', async () => {
    const g = mountIn(h(GaugeChart, { value: 72, max: 100, title: 'Rychlost', messages: CS }))
    const hm = mountIn(h(HeatmapChart<{ r: string; c: string; v: number }>, {
      data: [{ r: 'a', c: 'x', v: 1 }, { r: 'b', c: 'y', v: 4 }],
      x: (d: { c: string }) => d.c,
      y: (d: { r: string }) => d.r,
      value: (d: { v: number }) => d.v,
      title: 'Teplo',
      messages: CS,
    }))
    await new Promise((r) => setTimeout(r, 30))
    expect(g.querySelector('canvas')!.getAttribute('aria-label')).toBe('Rychlost: 72 z 100.')
    expect(hm.querySelector('canvas')!.getAttribute('aria-label')).toBe('Teplo: 2 sloupců a 2 řádků, hodnoty 1 až 4.')
    expect(hm.querySelector('table th')!.textContent).toBe('Kategorie')
  })

  it('the static SVG export derives its <desc> in the given words', () => {
    const svg = chartToSvg({ data: rows, x: (d) => d.day, marks: [bars<{ day: string; n: number }>((d) => d.n, { label: 'Prodej' })], title: 'Prodej', width: 300, height: 150, messages: CS })
    expect(svg).toContain('Prodej. 1 řada v 2 kategoriích od po do út.')
    expect(gaugeToSvg({ value: 3, max: 10, title: 'G', messages: CS })).toContain('G: 3 z 10.')
  })
})

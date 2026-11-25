// Every `*ToSvg` export takes `locale` (#4832): the registered pack's words
// (the call's own `messages` winning field by field) and the locale's digits,
// in the derived description AND in the numbers it draws, as the live
// components do. Without `locale` the English output is unchanged.
import { describe, expect, it } from 'vitest'
import type { ChartMessages } from './a11y'
import { boxplotToSvg } from './boxplot-svg'
import {
  calendarToSvg,
  candlestickToSvg,
  chordToSvg,
  funnelToSvg,
  ganttToSvg,
  gaugeToSvg,
  graphToSvg,
  heatmapToSvg,
  parallelToSvg,
  pieToSvg,
  polarToSvg,
  radarToSvg,
  riverToSvg,
  sankeyToSvg,
  sunburstToSvg,
  treemapToSvg,
  treeToSvg,
} from './family-svg'
import { geoToSvg } from './geo-web'
import { registerLocale } from './locale'
import { bars } from './marks'
import { singleAxisToSvg } from './single-axis-web'
import { chartToSvg } from './svg-chart'

const CS: ChartMessages = {
  untitled: 'Graf',
  noData: '{title}: žádná data.',
  overview: '{title}. {series} v {count} kategoriích od {first} do {last}.',
  overviewPlain: '{title}. {series}.',
  oneSeries: '1 řada',
  manySeries: 'řady: {n}',
  rising: 'roste',
  falling: 'klesá',
  flat: 'beze změny',
  trend: '{label}, {kind}: {direction}{change} z {first} na {last}, rozsah {low}{lowAt} až {high}{highAt}.',
  at: ' ({category})',
  percent: '{n} %',
  kindBars: 'sloupce',
  kindPie: 'výseče',
  kindRadar: 'paprsky',
  valueLabel: 'Hodnota',
  gauge: '{title}: {value} z {max}.',
  candlestick: '{title}: {count} období, rozsah {min} až {max}, poslední {close}.',
  heatmap: '{title}: {columns} sloupců a {rows} řádků, hodnoty {min} až {max}.',
  funnelDescription: '{title}: fáze {count}, {list}.',
  treemapDescription: '{title}: listy {leaves}, největší {largest}.',
  sunburstDescription: '{title}: úrovně {levels}, listy {leaves}.',
  treeDescription: '{title}: uzly {nodes}, listy {leaves}.',
  chordDescription: '{title}: kategorie {categories}, toky {flows}.',
  riverDescription: '{title}: proudy {streams} v {points} bodech ({list}).',
  polarDescription: '{title}: řady {series} v {count} kategoriích, hodnoty {min} až {max}.',
  sankeyDescription: '{title}: uzly {nodes}, toky {flows}, celkem {total}.',
  graphDescription: '{title}: uzly {nodes}, vazby {links}.',
  calendarDescription: '{title}: dny {days} od {start} do {end}, s hodnotou {filled} od {min} do {max}.',
  ganttDescription: '{title}: úkoly {tasks} od {start} do {end}.',
  parallelDescription: '{title}: řádky {rows} na {axes} osách ({list}).',
  boxplotDescription: '{title}: krabice {count}, mediány {list}.',
  mapDescription: '{title}: oblasti {regions}, s hodnotou {filled} od {min} do {max}{overlays}.',
  singleAxisDescription: '{title}: body {points} na ose typu {axis}.',
}

registerLocale('cs-CZ', { messages: CS })

/** The derived `<desc>` of an svg string. */
const desc = (svg: string): string => /<desc[^>]*>([^<]*)<\/desc>/.exec(svg)?.[1] ?? ''
/** The drawn text of an svg string. */
const texts = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!)

const ENGLISH = /\b(series|categor(?:y|ies)|stages?|lea(?:f|ves)|levels?|nodes?|flows?|links?|streams?|points?|rows?|ax(?:is|es)|days?|tasks?|box(?:es)?|medians?|regions?|totalling|largest|rising|ranging|Value|of|from|to|with|over)\b/
const DOT_DECIMAL = /\d\.\d/

const SQUARE = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } }] }

/** Every `*ToSvg` with data that has a fractional number, with and without `locale`. */
const calls: [string, (locale: string | undefined) => string][] = [
  ['chartToSvg', (locale) => chartToSvg({ data: [{ d: 'po', n: 1.5 }, { d: 'út', n: 4.8 }], x: (r) => r.d, marks: [bars<{ d: string; n: number }>((r) => r.n, { label: 'Prodej' })], title: 'Prodej', locale })],
  ['pieToSvg', (locale) => pieToSvg({ data: [{ k: 'a', v: 1.5 }, { k: 'b', v: 2.25 }], value: (r) => r.v, label: (r) => r.k, title: 'Podíl', locale })],
  ['gaugeToSvg', (locale) => gaugeToSvg({ value: 72.5, max: 100, title: 'Rychlost', locale })],
  ['radarToSvg', (locale) => radarToSvg({ data: [{ n: 'A', v: [1.5, 2.5, 3] }], axes: [{ label: 'x', max: 5 }, { label: 'y', max: 5 }, { label: 'z', max: 5 }], values: (r) => r.v, label: (r) => r.n, title: 'Tým', locale })],
  ['candlestickToSvg', (locale) => candlestickToSvg({ data: [{ o: 1.5, h: 2.5, l: 1.25, c: 2 }, { o: 2, h: 3.5, l: 1.75, c: 3.25 }], open: (r) => r.o, high: (r) => r.h, low: (r) => r.l, close: (r) => r.c, title: 'Kurz', locale })],
  ['heatmapToSvg', (locale) => heatmapToSvg({ data: [{ r: 'a', c: 'x', v: 1.5 }, { r: 'b', c: 'y', v: 4.25 }], x: (d) => d.c, y: (d) => d.r, value: (d) => d.v, title: 'Teplo', locale })],
  ['funnelToSvg', (locale) => funnelToSvg({ data: [{ k: 'Návštěvy', v: 1200.5 }, { k: 'Nákupy', v: 300 }], value: (r) => r.v, label: (r) => r.k, title: 'Trychtýř', locale })],
  ['treemapToSvg', (locale) => treemapToSvg({ data: [{ name: 'src', value: 50.5 }, { name: 'docs', value: 30 }], title: 'Soubory', locale })],
  ['sunburstToSvg', (locale) => sunburstToSvg({ data: [{ name: 'src', children: [{ name: 'a', value: 2.5 }] }], title: 'Soubory', locale })],
  ['treeToSvg', (locale) => treeToSvg({ data: [{ name: 'root', children: [{ name: 'a' }, { name: 'b' }] }], title: 'Strom', locale })],
  ['chordToSvg', (locale) => chordToSvg({ nodes: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 2.5 }], title: 'Toky', locale })],
  ['riverToSvg', (locale) => riverToSvg({ series: [{ name: 'a', values: [1.5, 2.5] }], title: 'Řeka', locale })],
  ['polarToSvg', (locale) => polarToSvg({ axes: { categories: ['x', 'y'] }, series: [{ name: 'a', kind: 'bar', values: [1.5, 2.5] }], title: 'Polár', locale })],
  ['sankeyToSvg', (locale) => sankeyToSvg({ nodes: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 2.5 }], title: 'Toky', locale })],
  ['graphToSvg', (locale) => graphToSvg({ nodes: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }], links: [{ source: 'a', target: 'b' }], title: 'Síť', locale })],
  ['calendarToSvg', (locale) => calendarToSvg({ start: '2026-01-01', end: '2026-01-31', values: { '2026-01-05': 3.5, '2026-01-06': 1 }, title: 'Aktivita', locale })],
  ['ganttToSvg', (locale) => ganttToSvg({ tasks: [{ id: 'a', name: 'a', start: '2026-01-01', end: '2026-01-05' }], title: 'Plán', locale })],
  ['parallelToSvg', (locale) => parallelToSvg({ axes: [{ name: 'A' }, { name: 'B' }], rows: [[1.5, 2.5], [3.5, 4.5]], title: 'Osy', locale })],
  ['boxplotToSvg', (locale) => boxplotToSvg({ data: [{ v: [1.5, 2.5, 3.5, 4.5] }], values: (r) => r.v, title: 'Krabice', locale })],
  ['geoToSvg', (locale) => geoToSvg({ geo: SQUARE as never, values: { A: 2.5 }, title: 'Mapa', locale })],
  ['singleAxisToSvg', (locale) => singleAxisToSvg({ axis: { type: 'value' }, points: [{ x: 1.5 }, { x: 2.5 }], title: 'Osa', locale })],
]

describe('every *ToSvg takes `locale`: the pack\'s words and the locale\'s digits', () => {
  for (const [name, call] of calls) {
    it(`${name}: a Czech description, no English word, no dot decimal`, () => {
      const d = desc(call('cs-CZ'))
      expect(d).not.toBe('')
      expect(d).not.toMatch(ENGLISH)
      expect(d).not.toMatch(DOT_DECIMAL)
    })
  }

  it('the drawn numbers follow the locale too (axes, ticks, the gauge value)', () => {
    expect(texts(gaugeToSvg({ value: 72.5, max: 100, locale: 'cs-CZ' }))).toContain('72,5')
    expect(texts(candlestickToSvg({ data: [{ o: 1.5, h: 2.5, l: 1.25, c: 2 }], open: (r) => r.o, high: (r) => r.h, low: (r) => r.l, close: (r) => r.c, locale: 'cs-CZ' })).some((t) => /^\d+,\d+$/.test(t))).toBe(true)
    expect(texts(parallelToSvg({ axes: [{ name: 'A' }, { name: 'B' }], rows: [[1.5, 2.5], [3.5, 4.5]], locale: 'cs-CZ' }))).toContain('1,5')
    expect(texts(singleAxisToSvg({ axis: { type: 'value', domain: { min: 0, max: 1 } }, points: [{ x: 0.25 }], locale: 'cs-CZ' })).some((t) => /^0,\d+$/.test(t))).toBe(true)
  })

  it('`messages` win over the pack field by field', () => {
    const d = desc(treemapToSvg({ data: [{ name: 'src', value: 50.5 }], title: 'S', locale: 'cs-CZ', messages: { treemapDescription: '{title} — {largest}' } }))
    expect(d).toBe('S — src')
  })

  it('without `locale` the English output is unchanged', () => {
    expect(desc(gaugeToSvg({ value: 72.5, max: 100, title: 'Speed' }))).toBe('Speed: 72.5 of 100.')
    expect(desc(treemapToSvg({ data: [{ name: 'src', value: 50.5 }, { name: 'docs', value: 30 }], title: 'Files' }))).toBe('Files: 2 leaves, largest src.')
    expect(desc(sankeyToSvg({ nodes: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 2.5 }], title: 'T' }))).toBe('T: 2 nodes, 1 flow totalling 2.5.')
    expect(desc(funnelToSvg({ data: [{ k: 'Visits', v: 1200.5 }], value: (r) => r.v, label: (r) => r.k, title: 'F' }))).toBe('F: 1 stages, Visits 1200.5.')
  })
})

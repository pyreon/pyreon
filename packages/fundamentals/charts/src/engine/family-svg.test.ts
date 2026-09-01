// Server-side SVG for the whole family — pure string in, string out, so every
// assertion here runs with no DOM and no canvas, exactly like the target
// environments (SSG build, serverless function, email pipeline).

import { describe, expect, it } from 'vitest'
import { candlestickToSvg, gaugeToSvg, heatmapToSvg, pieToSvg, radarToSvg } from './family-svg'

interface Share {
  name: string
  n: number
}
const SHARES: Share[] = [
  { name: 'Direct', n: 40 },
  { name: 'Search', n: 35 },
  { name: 'Social', n: 25 },
]

interface Bar {
  day: string
  o: number
  h: number
  l: number
  c: number
}
const BARS: Bar[] = [
  { day: 'Mon', o: 10, h: 20, l: 5, c: 15 },
  { day: 'Tue', o: 15, h: 25, l: 12, c: 13 },
]

interface Obs {
  day: string
  hour: string
  n: number
}
const OBS: Obs[] = [
  { day: 'Mon', hour: '09', n: 5 },
  { day: 'Tue', hour: '10', n: 9 },
]

interface Player {
  name: string
  s: number
  p: number
  k: number
}
const PLAYERS: Player[] = [
  { name: 'Ana', s: 90, p: 40, k: 80 },
  { name: 'Ben', s: 30, p: 85, k: 55 },
]

const count = (s: string, needle: string): number => s.split(needle).length - 1

const wellFormed = (s: string): void => {
  expect(s.startsWith('<svg')).toBe(true)
  expect(s.endsWith('</svg>')).toBe(true)
  expect(s).not.toContain('NaN')
  expect(s).not.toContain('undefined')
}

describe('pieToSvg', () => {
  it('renders one polygon per slice plus labels', () => {
    const s = pieToSvg<Share>({ data: SHARES, value: (d) => d.n, label: (d) => d.name })
    wellFormed(s)
    expect(count(s, '<polygon')).toBe(3)
    expect(s).toContain('%<') // percentage labels
  })

  it('derives the accessible description from the data when titled', () => {
    const s = pieToSvg<Share>({ data: SHARES, value: (d) => d.n, label: (d) => d.name, title: 'Traffic' })
    expect(s).toContain('>Traffic</title>')
    expect(s).toContain('Direct')
  })

  it('a legend consumes height, not correctness', () => {
    const s = pieToSvg<Share>({
      data: SHARES,
      value: (d) => d.n,
      label: (d) => d.name,
      showLegend: true,
      showLabels: false,
    })
    wellFormed(s)
    expect(count(s, '<polygon')).toBe(3)
    expect(s).toContain('Search') // legend text made it in
  })

  it('is deterministic — the same input renders the same bytes', () => {
    const make = () => pieToSvg<Share>({ data: SHARES, value: (d) => d.n, label: (d) => d.name })
    expect(make()).toBe(make())
  })

  it('empty data is a valid, empty svg — not NaN soup', () => {
    wellFormed(pieToSvg<Share>({ data: [], value: (d) => d.n, label: (d) => d.name }))
  })
})

describe('gaugeToSvg', () => {
  it('renders track + value arcs and prints the value', () => {
    const s = gaugeToSvg({ value: 42, title: 'CPU' })
    wellFormed(s)
    expect(count(s, '<polygon')).toBe(2)
    expect(s).toContain('>42<')
    expect(s).toContain('>CPU</title>')
    expect(s).toContain('42 of 100')
  })

  it('showValue: false drops the text', () => {
    expect(gaugeToSvg({ value: 42, showValue: false })).not.toContain('>42<')
  })
})

describe('radarToSvg', () => {
  it('renders the web, one filled polygon per row, and axis labels', () => {
    const s = radarToSvg<Player>({
      data: PLAYERS,
      axes: [
        { label: 'Speed', max: 100 },
        { label: 'Power', max: 100 },
        { label: 'Skill', max: 100 },
      ],
      values: (d) => [d.s, d.p, d.k],
      label: (d) => d.name,
      title: 'Form',
    })
    wellFormed(s)
    // 4 grid rings as polylines + axis spokes as lines; 2 series polygons.
    expect(count(s, '<polygon')).toBe(2)
    expect(s).toContain('Speed')
    expect(s).toContain('Ana')
  })

  it('fewer than three axes renders an empty svg — no area to enclose', () => {
    const s = radarToSvg<Player>({
      data: PLAYERS,
      axes: [{ label: 'Speed', max: 100 }],
      values: (d) => [d.s],
      label: (d) => d.name,
    })
    wellFormed(s)
    expect(count(s, '<polygon')).toBe(0)
  })
})

describe('candlestickToSvg', () => {
  it('renders one wick line + one body rect per period, with axes', () => {
    const s = candlestickToSvg<Bar>({
      data: BARS,
      open: (d) => d.o,
      high: (d) => d.h,
      low: (d) => d.l,
      close: (d) => d.c,
      x: (d) => d.day,
      title: 'AAPL',
    })
    wellFormed(s)
    expect(count(s, '<rect')).toBe(2)
    expect(s).toContain('Mon')
    expect(s).toContain('last close 13')
  })

  it('empty data is a valid svg with an honest description', () => {
    const s = candlestickToSvg<Bar>({
      data: [],
      open: (d) => d.o,
      high: (d) => d.h,
      low: (d) => d.l,
      close: (d) => d.c,
      title: 'Empty',
    })
    wellFormed(s)
    expect(s).toContain('no data')
  })
})

describe('heatmapToSvg', () => {
  it('renders one rect per drawn cell + both label rails', () => {
    const s = heatmapToSvg<Obs>({
      data: OBS,
      x: (d) => d.day,
      y: (d) => d.hour,
      value: (d) => d.n,
      title: 'Traffic',
    })
    wellFormed(s)
    // Two observations in a 2x2 grid: two drawn cells, absent cells undrawn.
    expect(count(s, '<rect')).toBe(2)
    expect(s).toContain('Mon')
    expect(s).toContain('09')
    expect(s).toContain('2 columns by 2 rows')
  })

  it('duplicate observations SUM into one cell', () => {
    const s = heatmapToSvg<Obs>({
      data: [...OBS, { day: 'Mon', hour: '09', n: 5 }],
      x: (d) => d.day,
      y: (d) => d.hour,
      value: (d) => d.n,
      title: 'T',
    })
    expect(count(s, '<rect')).toBe(2)
    expect(s).toContain('values 9 to 10')
  })
})

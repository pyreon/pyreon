import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { RadarChart } from './RadarChart'

interface Player {
  name: string
  speed: number
  power: number
  skill: number
  stamina: number
}

const AXES = [
  { label: 'Speed', max: 100 },
  { label: 'Power', max: 100 },
  { label: 'Skill', max: 100 },
  { label: 'Stamina', max: 100 },
]

const DATA: Player[] = [
  { name: 'Ana', speed: 90, power: 40, skill: 80, stamina: 60 },
  { name: 'Ben', speed: 30, power: 85, skill: 55, stamina: 75 },
]

const values = (d: Player): number[] => [d.speed, d.power, d.skill, d.stamina]

function inkedPixels(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return 0
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('RadarChart in a real browser', () => {
  it('paints the web and both polygons', async () => {
    const { container } = mountInBrowser(() =>
      RadarChart<Player>({
        data: DATA,
        axes: AXES,
        values,
        label: (d) => d.name,
        width: 300,
        height: 260,
      }),
    )
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    expect(inkedPixels(canvas)).toBeGreaterThan(1000)
  })

  it('repaints when the data changes', async () => {
    const rows = signal<Player[]>([DATA[0]!])
    const { container } = mountInBrowser(() =>
      RadarChart<Player>({
        data: () => rows(),
        axes: AXES,
        values,
        label: (d) => d.name,
        width: 300,
        height: 260,
        showLabels: false,
      }),
    )
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const before = inkedPixels(canvas)
    rows.set(DATA)
    await flush()
    // A second polygon adds ink; equality would mean the effect never re-ran.
    expect(inkedPixels(canvas)).toBeGreaterThan(before)
  })

  it('draws nothing for fewer than three axes — no area to enclose', async () => {
    const { container } = mountInBrowser(() =>
      RadarChart<Player>({
        data: DATA,
        axes: AXES.slice(0, 2),
        values: (d) => [d.speed, d.power],
        label: (d) => d.name,
        width: 300,
        height: 260,
        showLabels: false,
      }),
    )
    await flush()
    expect(inkedPixels(query<HTMLCanvasElement>(container, 'canvas'))).toBe(0)
  })

  it('legend costs height, not silence — polygons still paint under it', async () => {
    const { container } = mountInBrowser(() =>
      RadarChart<Player>({
        data: DATA,
        axes: AXES,
        values,
        label: (d) => d.name,
        width: 300,
        height: 260,
        showLegend: true,
      }),
    )
    await flush()
    expect(inkedPixels(query<HTMLCanvasElement>(container, 'canvas'))).toBeGreaterThan(1000)
  })

  it('describes itself to assistive tech and ships the offscreen table', async () => {
    const { container } = mountInBrowser(() =>
      RadarChart<Player>({
        data: DATA,
        axes: AXES,
        values,
        label: (d) => d.name,
        width: 300,
        height: 260,
        title: 'Season form',
      }),
    )
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    expect(canvas.getAttribute('role')).toBe('img')
    const label = canvas.getAttribute('aria-label') ?? ''
    expect(label).toContain('Season form')
    expect(label).toContain('2 series')
    expect(label).toContain('Ana')
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    const headers = [...container.querySelectorAll('th[scope="col"]')].map((x) => x.textContent)
    expect(headers).toEqual(['Category', 'Ana', 'Ben'])
    const firstRow = [...container.querySelectorAll('tbody th[scope="row"]')].map((x) => x.textContent)
    expect(firstRow).toEqual(['Speed', 'Power', 'Skill', 'Stamina'])
  })
})

import { describe, expect, it } from 'vitest'
import { ganttDurationDays, ganttTicks, layoutGantt, renderGantt } from './gantt'
import { hitGantt } from './gantt-web'
import { ganttToSvg } from './family-svg'
import { daysFromCivil } from './calendar'
import { approxTextWidth } from './treemap'
import type { GanttTask } from './gantt'

const tasks: GanttTask[] = [
  { id: 'a', name: 'Design', start: '2024-03-01', end: '2024-03-10', progress: 0.5, group: 'Phase 1' },
  { id: 'b', name: 'Build', start: '2024-03-08', end: '2024-03-24', dependencies: ['a'], group: 'Phase 1' },
  { id: 'c', name: 'Launch', start: '2024-03-25', milestone: true, dependencies: ['b'], group: 'Phase 2' },
]
const box = { x: 0, y: 0, w: 600, h: 200 }

describe('layoutGantt', () => {
  it('one row per task, a lane header per group change, bars placed on the padded time domain in order', () => {
    const l = layoutGantt(tasks, box)
    expect(l.rows).toHaveLength(3)
    expect(l.lanes.map((x) => x.text)).toEqual(['Phase 1', 'Phase 2'])
    const [a, b, c] = l.rows
    expect(a!.rect.x).toBeGreaterThan(l.plot.x)
    expect(b!.rect.x).toBeGreaterThan(a!.rect.x)
    expect(b!.rect.x).toBeLessThan(a!.rect.x + a!.rect.w)
    expect(c!.rect.y).toBeGreaterThan(b!.rect.y + b!.rect.h)
    // Milestone: square bounding box at its instant, zero duration.
    expect(c!.rect.w).toBeCloseTo(c!.rect.h, 5)
    expect(ganttDurationDays(c!)).toBe(0)
    expect(ganttDurationDays(a!)).toBe(9)
    expect(l.unit).toBe('week')
    expect(l.ticks.length).toBeGreaterThan(2)
    for (const t of l.ticks) expect(t.x).toBeGreaterThanOrEqual(l.plot.x - 0.001)
  })
  it('dependencies elbow from the predecessor end to the successor start', () => {
    const l = layoutGantt(tasks, box)
    expect(l.dependencies.map((d) => d.from + '>' + d.to)).toEqual(['a>b', 'b>c'])
    const ab = l.dependencies[0]!
    const a = l.rows[0]!
    const b = l.rows[1]!
    expect(ab.points[0]).toEqual({ x: a.rect.x + a.rect.w, y: a.rect.y + a.rect.h / 2 })
    expect(ab.points[ab.points.length - 1]).toEqual({ x: b.rect.x, y: b.rect.y + b.rect.h / 2 })
    // An unknown id is skipped, never thrown on.
    expect(layoutGantt([{ id: 'x', name: 'x', start: '2024-01-01', end: '2024-01-02', dependencies: ['nope'] }], box).dependencies).toEqual([])
  })
  it('an explicit domain and a today marker map onto the plot; the label column caps at the fraction', () => {
    const l = layoutGantt(tasks, box, { domain: { start: '2024-03-01', end: '2024-03-31' }, today: '2024-03-16', labelFraction: 0.2 })
    expect(l.domain).toEqual({ min: daysFromCivil(2024, 3, 1), max: daysFromCivil(2024, 3, 31) })
    expect(l.todayX).toBeCloseTo(l.plot.x + l.plot.w / 2, 5)
    expect(l.plot.x).toBeLessThanOrEqual(box.w * 0.2 + 0.001)
    expect(l.rows[0]!.rect.x).toBeCloseTo(l.plot.x, 5)
  })
  it('picks a tick unit by span and aligns ticks to calendar boundaries', () => {
    const day = ganttTicks(daysFromCivil(2024, 1, 3) + 0.5, daysFromCivil(2024, 1, 6), 'day')
    expect(day.map((t) => t.label)).toEqual(['4 Jan', '5 Jan', '6 Jan'])
    const month = ganttTicks(daysFromCivil(2024, 1, 15), daysFromCivil(2024, 4, 2), 'month')
    expect(month.map((t) => t.label)).toEqual(['Feb', 'Mar', 'Apr'])
    const quarter = ganttTicks(daysFromCivil(2023, 11, 1), daysFromCivil(2024, 9, 1), 'quarter')
    expect(quarter.map((t) => t.label)).toEqual(['Q1 2024', 'Q2 2024', 'Q3 2024'])
    const year = ganttTicks(daysFromCivil(2020, 6, 1), daysFromCivil(2023, 1, 1), 'year')
    expect(year.map((t) => t.label)).toEqual(['2021', '2022', '2023'])
    expect(layoutGantt([{ id: 'a', name: 'a', start: '2024-01-01', end: '2024-01-05' }], box).unit).toBe('day')
    expect(layoutGantt([{ id: 'a', name: 'a', start: '2020-01-01', end: '2030-01-05' }], box).unit).toBe('year')
  })
})

describe('renderGantt + hit + svg', () => {
  it('draws a bar per task, a progress inset, a diamond for the milestone, elbows and the today line', () => {
    const l = layoutGantt(tasks, box, { today: '2024-03-16' })
    const cmds = renderGantt(l, { today: '2024-03-16' })
    const rects = cmds.filter((c) => c.kind === 'rect')
    // 2 lane bands + 2 bars + 1 progress inset.
    expect(rects).toHaveLength(5)
    expect(cmds.filter((c) => c.kind === 'polygon')).toHaveLength(1)
    expect(cmds.filter((c) => c.kind === 'polyline')).toHaveLength(2)
    expect(cmds.filter((c) => c.kind === 'line' && c.dash !== undefined)).toHaveLength(1)
    // Entrance progress shortens bars and hides dependencies.
    const half = renderGantt(l, { progress: 0.5 })
    expect(half.filter((c) => c.kind === 'polyline')).toHaveLength(0)
    const bar = half.find((c) => c.kind === 'rect' && c.rect.h === l.rows[0]!.rect.h)!
    expect(bar.kind === 'rect' && bar.rect.w).toBeCloseTo(l.rows[0]!.rect.w / 2, 5)
  })
  it('hit: the bar first, then the row band right of the labels, nothing in the label column', () => {
    const l = layoutGantt(tasks, box)
    const b = l.rows[1]!
    expect(hitGantt(l, b.rect.x + 2, b.rect.y + 2)!.task.id).toBe('b')
    expect(hitGantt(l, l.plot.x + 1, b.band.y + 1)!.task.id).toBe('b')
    expect(hitGantt(l, l.plot.x - 1, b.band.y + 1)).toBeNull()
    expect(hitGantt(l, l.plot.x + 1, l.axis.y + 1)).toBeNull()
  })
  it('ganttToSvg emits a labelled svg with the task names and a derived description', () => {
    const svg = ganttToSvg({ tasks, width: 600, height: 200, title: 'Roadmap' })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('Roadmap')
    expect(svg).toContain('3 tasks')
    for (const t of tasks) expect(svg).toContain('>' + t.name + '<')
    expect(svg).toContain('<polygon')
  })
})

describe('gantt tick labels stay inside the plot (#4269)', () => {
  const short: GanttTask[] = [
    { id: 'a', name: 'Design', start: '2024-01-01', end: '2024-01-10' },
    { id: 'c', name: 'Ship', start: '2024-01-25', end: '2024-01-30' },
  ]
  it('pulls the last label back so it ends at the plot edge, and leaves the others at tick + 3', () => {
    const l = layoutGantt(short, { x: 4, y: 4, w: 350, h: 152 })
    const right = l.plot.x + l.plot.w
    const last = l.ticks.at(-1)!
    expect(last.label).toBe('29 Jan')
    // Unclamped, it would start at tick + 3 and run past the edge.
    expect(last.x + 3 + approxTextWidth(last.label, 11)).toBeGreaterThan(right)
    expect(last.labelX + approxTextWidth(last.label, 11)).toBeCloseTo(right, 6)
    for (const t of l.ticks.slice(0, -1)) expect(t.labelX).toBe(t.x + 3)
    expect(l.ticks.every((t) => t.labelShown)).toBe(true)
    const text = renderGantt(l).find((c) => c.kind === 'text' && c.text === '29 Jan')
    expect(text?.kind === 'text' ? text.at.x : Number.NaN).toBe(last.labelX)
  })
  it('a pulled-back label that would land on the one before it is left out, never stacked', () => {
    // Day ticks ~21px apart with ~30px labels: the last two both overflow and
    // would pull back onto the same spot.
    const crowded: GanttTask[] = [
      { id: '1', name: 'Design', start: '2024-01-01', end: '2024-01-10' },
      { id: '2', name: 'Build', start: '2024-01-08', end: '2024-01-20' },
    ]
    const l = layoutGantt(crowded, { x: 0, y: 0, w: 480, h: 280 })
    const right = l.plot.x + l.plot.w
    expect(l.ticks.some((t) => !t.labelShown)).toBe(true)
    const shown = l.ticks.filter((t) => t.labelShown)
    for (const t of shown) expect(t.labelX + approxTextWidth(t.label, 11)).toBeLessThanOrEqual(right + 1e-9)
    const drawn = renderGantt(l).filter((c) => c.kind === 'text' && l.ticks.some((t) => t.label === c.text))
    expect(drawn).toHaveLength(shown.length)
    const xs = drawn.map((c) => (c.kind === 'text' ? c.at.x : 0))
    expect(new Set(xs).size).toBe(xs.length)
  })
  it('a label wider than the whole plot starts at the plot edge rather than left of it', () => {
    const l = layoutGantt(short, { x: 4, y: 4, w: 120, h: 152 }, { fontSize: 40 })
    for (const t of l.ticks) expect(t.labelX).toBeGreaterThanOrEqual(l.plot.x)
    expect(l.ticks.some((t) => t.labelX === l.plot.x)).toBe(true)
  })
})

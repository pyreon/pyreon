// Branch coverage for the gantt family. Most of the uncovered surface is
// CALENDAR arithmetic — the tick unit chosen per span, the month/quarter/year
// steppers that have to cross a year boundary, and the label that only carries
// a year when the span does — plus the box-fitting clamps that a small host
// reaches.
import { describe, expect, it } from 'vitest'
import { ganttDurationDays, ganttTicks, hitGanttIndex, layoutGantt, renderGantt } from './gantt'
import type { GanttTask } from './gantt'
import { daysFromCivil } from './calendar'

const box = { x: 0, y: 0, w: 600, h: 300 }
const tasks: GanttTask[] = [
  { id: 'a', name: 'Design', start: '2024-01-01', end: '2024-01-10' },
  { id: 'b', name: 'Build', start: '2024-01-08', end: '2024-01-20', dependencies: ['a'] },
]
const spanning = (start: string, end: string): GanttTask[] => [{ id: 'x', name: 'x', start, end }]

describe('gantt — the tick unit follows the span', () => {
  const unitFor = (start: string, end: string) => layoutGantt(spanning(start, end), box).unit
  it('picks day, week, month, quarter and year as the span grows', () => {
    expect(unitFor('2024-01-01', '2024-01-10')).toBe('day')
    expect(unitFor('2024-01-01', '2024-03-01')).toBe('week')
    expect(unitFor('2024-01-01', '2025-01-01')).toBe('month')
    expect(unitFor('2024-01-01', '2029-01-01')).toBe('quarter')
    expect(unitFor('2024-01-01', '2044-01-01')).toBe('year')
  })
  it('each unit produces ticks in ascending order inside the domain', () => {
    for (const [s, e] of [['2024-01-01', '2024-01-10'], ['2024-01-01', '2024-03-01'], ['2024-01-01', '2025-01-01'], ['2024-01-01', '2029-01-01'], ['2024-01-01', '2044-01-01']]) {
      const l = layoutGantt(spanning(s!, e!), box)
      expect(l.ticks.length).toBeGreaterThan(0)
      for (let i = 1; i < l.ticks.length; i++) expect(l.ticks[i]!.at).toBeGreaterThan(l.ticks[i - 1]!.at)
      expect(l.ticks[0]!.at).toBeGreaterThanOrEqual(l.domain.min)
      expect(l.ticks.at(-1)!.at).toBeLessThanOrEqual(l.domain.max)
    }
  })
})

describe('gantt — tick labels and the calendar steppers', () => {
  const lo = daysFromCivil(2024, 11, 1)
  it('a MONTH stepper crosses the year boundary onto January', () => {
    const ticks = ganttTicks(lo, lo + 120, 'month')
    const labels = ticks.map((t) => t.label)
    expect(labels).toContain('Jan 2025')
    expect(labels[0], 'a multi-year span carries the year on every label').toBe('Nov 2024')
  })
  it('a month span inside ONE year drops the year from the label', () => {
    const jan = daysFromCivil(2024, 1, 1)
    expect(ganttTicks(jan, jan + 200, 'month').map((t) => t.label)).toContain('Mar')
  })
  it('a QUARTER stepper crosses the year boundary and names the quarter', () => {
    const oct = daysFromCivil(2024, 10, 1)
    const labels = ganttTicks(oct, oct + 400, 'quarter').map((t) => t.label)
    expect(labels[0]).toBe('Q4 2024')
    expect(labels).toContain('Q1 2025')
  })
  it('a YEAR stepper produces bare years', () => {
    const jan = daysFromCivil(2020, 1, 1)
    expect(ganttTicks(jan, jan + 1200, 'year').map((t) => t.label)).toEqual(['2020', '2021', '2022', '2023'])
  })
  it('day and week ticks are day-of-month plus the month name', () => {
    const jan = daysFromCivil(2024, 1, 1)
    expect(ganttTicks(jan, jan + 3, 'day')[0]!.label).toBe('1 Jan')
    expect(ganttTicks(jan, jan + 20, 'week')[0]!.label).toMatch(/^\d+ Jan$/)
  })
  it('a span shorter than one step still yields the aligned tick when it is inside', () => {
    const jan = daysFromCivil(2024, 1, 1)
    expect(ganttTicks(jan, jan, 'day')).toHaveLength(1)
  })
})

describe('gantt — the time domain', () => {
  it('NO tasks falls back to a month of 2024 rather than an empty domain', () => {
    const l = layoutGantt([], box)
    expect(l.rows).toEqual([])
    expect(l.domain.max).toBeGreaterThan(l.domain.min)
    expect(l.ticks.length).toBeGreaterThan(0)
  })
  it('a single MILESTONE would collapse the domain, so it is widened by a day first', () => {
    const l = layoutGantt([{ id: 'm', name: 'Ship', start: '2024-05-05', milestone: true }], box)
    expect(l.domain.max).toBeGreaterThan(l.domain.min)
    expect(l.rows[0]!.startDay).toBe(l.rows[0]!.endDay)
  })
  it('an END before the START is pulled up to the start rather than drawn backwards', () => {
    const l = layoutGantt([{ id: 'x', name: 'x', start: '2024-03-10', end: '2024-03-01' }], box)
    expect(l.rows[0]!.endDay).toBe(l.rows[0]!.startDay)
  })
  it('an UNPARSEABLE start reads as day zero, and a missing end as the start', () => {
    const l = layoutGantt([{ id: 'x', name: 'x', start: 'not-a-date' }], box)
    expect(l.rows[0]!.startDay).toBe(0)
    expect(l.rows[0]!.endDay).toBe(0)
  })
  it("a `today` OUTSIDE the task range widens the domain to include it, on either side", () => {
    const before = layoutGantt(tasks, box, { today: '2023-06-01' })
    expect(before.domain.min).toBeLessThan(daysFromCivil(2023, 6, 2))
    expect(before.hasToday).toBe(true)
    const after = layoutGantt(tasks, box, { today: '2025-06-01' })
    expect(after.domain.max).toBeGreaterThan(daysFromCivil(2025, 5, 31))
  })
  it('a `today` INSIDE the range leaves the domain alone', () => {
    const plain = layoutGantt(tasks, box)
    const withToday = layoutGantt(tasks, box, { today: '2024-01-15' })
    expect(withToday.domain).toEqual(plain.domain)
    expect(withToday.todayX).toBeGreaterThan(withToday.plot.x)
  })
  it('an explicit domain replaces the padded extent; a BACKWARDS one is ignored', () => {
    const explicit = layoutGantt(tasks, box, { domain: { start: '2024-01-01', end: '2024-02-01' } })
    expect(explicit.domain).toEqual({ min: daysFromCivil(2024, 1, 1), max: daysFromCivil(2024, 2, 1) })
    const backwards = layoutGantt(tasks, box, { domain: { start: '2024-02-01', end: '2024-01-01' } })
    expect(backwards.domain, 'a domain that does not advance falls back to the padded extent').toEqual(layoutGantt(tasks, box).domain)
  })
  it('no today marker when the option is absent or unparseable', () => {
    expect(layoutGantt(tasks, box).hasToday).toBe(false)
    expect(layoutGantt(tasks, box, { today: 'whenever' }).hasToday).toBe(false)
    expect(layoutGantt(tasks, box, { today: 'whenever' }).todayX).toBe(0)
  })
})

describe('gantt — fitting the box', () => {
  it('the label column is capped at a fraction of the box, however long the names are', () => {
    const long = layoutGantt([{ id: 'x', name: 'a'.repeat(400), start: '2024-01-01', end: '2024-01-05' }], box)
    expect(long.plot.x - box.x).toBeCloseTo(600 * 0.35, 9)
    const short = layoutGantt([{ id: 'x', name: 'ab', start: '2024-01-01', end: '2024-01-05' }], box)
    expect(short.plot.x - box.x, 'a short name is not padded out to the cap').toBeLessThan(600 * 0.35)
  })
  it('a GROUP name can be what sets the label column width', () => {
    const grouped = layoutGantt([{ id: 'x', name: 'a', start: '2024-01-01', end: '2024-01-05', group: 'a-very-long-group-name' }], box)
    const plain = layoutGantt([{ id: 'x', name: 'a', start: '2024-01-01', end: '2024-01-05' }], box)
    expect(grouped.plot.x).toBeGreaterThan(plain.plot.x)
  })
  it('a label fraction that eats the whole box collapses the axis to zero rather than a negative width', () => {
    const l = layoutGantt([{ id: 'x', name: 'a'.repeat(400), start: '2024-01-01', end: '2024-01-05' }], box, { labelFraction: 2 })
    expect(l.axis.w).toBe(0)
    expect(l.plot.w).toBe(0)
  })
  it('a box shorter than the axis leaves no room at all, rather than a negative one', () => {
    const l = layoutGantt(tasks, { x: 0, y: 0, w: 600, h: 2 })
    expect(l.plot.h).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(l.rowHeight)).toBe(true)
  })
  it('the row height is clamped to 12..28 — many rows squeeze, few rows do not stretch', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, name: `t${i}`, start: '2024-01-01', end: '2024-01-05' }))
    expect(layoutGantt(many, box).rowHeight).toBe(12)
    expect(layoutGantt([tasks[0]!], box).rowHeight).toBe(28)
  })
  it('with NO tasks the default row height is used instead of dividing by zero rows', () => {
    expect(layoutGantt([], box).rowHeight).toBe(28)
  })
  it('an explicit rowHeight overrides the fit, and the plot grows past the box when the rows do not fit', () => {
    const l = layoutGantt(tasks, box, { rowHeight: 200 })
    expect(l.rowHeight).toBe(200)
    expect(l.plot.h, 'two 200px rows need 400px').toBe(400)
  })
  it('when the rows are SHORTER than the box the plot still fills it', () => {
    const l = layoutGantt([tasks[0]!], box, { rowHeight: 20 })
    expect(l.plot.h).toBe(300 - (12 + 12))
  })
  it('a very short row still gets a bar at least four pixels tall', () => {
    const l = layoutGantt(tasks, box, { rowHeight: 2 })
    expect(l.rows[0]!.rect.h).toBe(4)
  })
  it('a zero-length bar is widened to one pixel so it stays visible', () => {
    const l = layoutGantt([{ id: 'a', name: 'a', start: '2024-01-01', end: '2024-06-01' }, { id: 'b', name: 'b', start: '2024-03-01', end: '2024-03-01' }], box)
    expect(l.rows[1]!.rect.w, 'a same-day task becomes a milestone diamond, sized by the bar height').toBe(l.rows[1]!.rect.h)
  })
})

describe('gantt — lanes and dependencies', () => {
  it('a group header is emitted once per group change and shifts the rows down', () => {
    const grouped: GanttTask[] = [
      { id: 'a', name: 'a', start: '2024-01-01', end: '2024-01-05', group: 'G1' },
      { id: 'b', name: 'b', start: '2024-01-02', end: '2024-01-06', group: 'G1' },
      { id: 'c', name: 'c', start: '2024-01-03', end: '2024-01-07', group: 'G2' },
    ]
    const l = layoutGantt(grouped, box)
    expect(l.lanes.map((x) => x.text)).toEqual(['G1', 'G2'])
    expect(l.rows[0]!.labelAt.x, 'grouped rows are indented under their lane').toBeGreaterThan(layoutGantt(tasks, box).rows[0]!.labelAt.x)
  })
  it('a dependency to a LATER task routes forward; an OVERLAPPING one routes around', () => {
    // Forward: the predecessor ends before the successor starts, so the elbow
    // is a simple three-segment step.
    const forward = layoutGantt([
      { id: 'a', name: 'a', start: '2024-01-01', end: '2024-01-05' },
      { id: 'b', name: 'b', start: '2024-03-01', end: '2024-03-10', dependencies: ['a'] },
    ], box)
    expect(forward.dependencies).toHaveLength(1)
    expect(forward.dependencies[0]!.points).toHaveLength(4)
    const backward = layoutGantt([
      { id: 'a', name: 'a', start: '2024-03-01', end: '2024-03-10' },
      { id: 'b', name: 'b', start: '2024-01-01', end: '2024-01-10', dependencies: ['a'] },
    ], box)
    expect(backward.dependencies[0]!.points, 'a backwards link needs the detour above the row').toHaveLength(6)
    expect(layoutGantt(tasks, box).dependencies[0]!.points, 'so does an overlapping one').toHaveLength(6)
  })
  it('a dependency naming an UNKNOWN task is skipped', () => {
    const l = layoutGantt([{ id: 'a', name: 'a', start: '2024-01-01', end: '2024-01-05', dependencies: ['ghost'] }], box)
    expect(l.dependencies).toEqual([])
  })
})

describe('gantt — render', () => {
  const layout = layoutGantt(tasks, box, { today: '2024-01-12' })
  it('progress is clamped at both ends', () => {
    const settled = renderGantt(layout)
    expect(renderGantt(layout, { progress: 4 })).toEqual(settled)
    const zero = renderGantt(layout, { progress: -1 })
    const bar = zero.find((c) => c.kind === 'rect' && (c as { fill: string }).fill !== '#f3f4f6') as { rect: { w: number } }
    expect(bar.rect.w).toBe(0)
  })
  it('dependency lines are drawn on the settled frame only, and can be turned off', () => {
    expect(renderGantt(layout).filter((c) => c.kind === 'polyline')).toHaveLength(1)
    expect(renderGantt(layout, { progress: 0.5 }).filter((c) => c.kind === 'polyline')).toHaveLength(0)
    expect(renderGantt(layout, { showDependencies: false }).filter((c) => c.kind === 'polyline')).toHaveLength(0)
  })
  it('the today marker is a dashed line, and absent without the option', () => {
    expect(renderGantt(layout).some((c) => (c as { dash?: number[] }).dash !== undefined)).toBe(true)
    expect(renderGantt(layoutGantt(tasks, box)).some((c) => (c as { dash?: number[] }).dash !== undefined)).toBe(false)
  })
  it('a progress fill is drawn only when there is progress, and is CLAMPED at 100%', () => {
    const none = layoutGantt([{ id: 'a', name: 'a', start: '2024-01-01', end: '2024-01-10' }], box)
    const half = layoutGantt([{ id: 'a', name: 'a', start: '2024-01-01', end: '2024-01-10', progress: 0.5 }], box)
    const over = layoutGantt([{ id: 'a', name: 'a', start: '2024-01-01', end: '2024-01-10', progress: 5 }], box)
    const fillsOf = (l: typeof none) => renderGantt(l).filter((c) => c.kind === 'rect' && (c as { fill: string }).fill === 'rgba(0,0,0,0.35)') as { rect: { w: number } }[]
    expect(fillsOf(none)).toHaveLength(0)
    expect(fillsOf(half)).toHaveLength(1)
    const bar = renderGantt(over).find((c) => c.kind === 'rect' && (c as { fill: string }).fill !== 'rgba(0,0,0,0.35)') as { rect: { w: number } }
    expect(fillsOf(over)[0]!.rect.w, 'a progress over 1 fills the bar, it does not overflow it').toBeCloseTo(bar.rect.w, 9)
    expect(fillsOf(half)[0]!.rect.w).toBeCloseTo(bar.rect.w / 2, 9)
  })
  it('a milestone is drawn as a diamond that grows with the entrance', () => {
    const m = layoutGantt([{ id: 'm', name: 'm', start: '2024-05-05', milestone: true }], box)
    const full = renderGantt(m).find((c) => c.kind === 'polygon') as { points: { y: number }[] }
    const half = renderGantt(m, { progress: 0.5 }).find((c) => c.kind === 'polygon') as { points: { y: number }[] }
    const heightOf = (p: { points: { y: number }[] }) => Math.max(...p.points.map((q) => q.y)) - Math.min(...p.points.map((q) => q.y))
    expect(heightOf(half)).toBeCloseTo(heightOf(full) / 2, 9)
  })
  it('lane bands are painted behind their labels', () => {
    const grouped = layoutGantt([{ id: 'a', name: 'a', start: '2024-01-01', end: '2024-01-05', group: 'G' }], box)
    const cmds = renderGantt(grouped)
    expect(cmds[0]!.kind).toBe('rect')
    expect(cmds[1]!.kind).toBe('text')
  })
})

describe('gantt — hit test', () => {
  const layout = layoutGantt(tasks, box)
  it('a point on a BAR reports that task', () => {
    const r = layout.rows[1]!.rect
    expect(hitGanttIndex(layout, r.x + r.w / 2, r.y + r.h / 2)).toBe(1)
  })
  it('a point in the row BAND but off the bar still reports the row', () => {
    const b = layout.rows[0]!.band
    expect(hitGanttIndex(layout, layout.plot.x + layout.plot.w - 1, b.y + 1)).toBe(0)
  })
  it('a point left of the plot (over the labels) is a miss', () => {
    expect(hitGanttIndex(layout, box.x + 1, layout.rows[0]!.band.y + 1)).toBe(-1)
  })
  it('a point above every row is a miss', () => {
    expect(hitGanttIndex(layout, layout.plot.x + 10, box.y - 50)).toBe(-1)
  })
})

describe('gantt — duration in whole days', () => {
  it('rounds to the nearest whole day, both down and up', () => {
    const row = (s: number, e: number) => ({ startDay: s, endDay: e }) as never
    expect(ganttDurationDays(row(0, 3))).toBe(3)
    expect(ganttDurationDays(row(0, 3.2)), 'below the half rounds down').toBe(3)
    expect(ganttDurationDays(row(0, 3.5)), 'at the half rounds up').toBe(4)
    expect(ganttDurationDays(row(0, 3.9))).toBe(4)
    expect(ganttDurationDays(row(5, 5)), 'a milestone lasts no days').toBe(0)
  })
})

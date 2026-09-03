// Gantt geometry — one row per task on a shared time axis, with progress
// fills, milestones (diamonds), dependency elbows and a today marker. Pure:
// dates in, rects and commands out; the host and `ganttToSvg` both consume
// it. Written in the native subset and BUNDLED into the generated
// Swift/Kotlin engine: time is DAYS since 1970-01-01 (fractional allowed)
// through calendar.ts's civil arithmetic, dates are ISO strings, lookups are
// scans, the hit answers an INDEX (the nullable row lives in gantt-web.ts)
// and the svg half in family-svg.ts.

import { civilFromDays, daysFromCivil, parseIsoDays, weekdayOfDays } from './calendar'
import { approxTextWidth } from './treemap'
import type { Domain, Double, DrawCmd, MeasureText, Pt, Rect } from './types'

const GANTT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const GANTT_PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']

export interface GanttTask {
  id: string
  name: string
  /** ISO `YYYY-MM-DD`. */
  start: string
  /** ISO `YYYY-MM-DD`; a milestone may omit it (or equal `start`). */
  end?: string | undefined
  /** 0..1 done fraction; drawn as a darker inner bar. */
  progress?: Double | undefined
  /** Ids of tasks this one depends on; drawn as elbows from their end to this start. */
  dependencies?: string[] | undefined
  /** Lane header the task sits under; consecutive tasks with the same group share one header row. */
  group?: string | undefined
  color?: string | undefined
  milestone?: boolean | undefined
}

/** The tick unit the time axis settled on. */
export type GanttTickUnit = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface GanttTick {
  /** Days since 1970-01-01. */
  at: Double
  x: Double
  label: string
}

export interface GanttRow {
  task: GanttTask
  index: number
  /** The bar (a milestone's bounding box). */
  rect: Rect
  /** Row band across the whole plot, for hover/hit. */
  band: Rect
  /** Days since 1970-01-01. */
  startDay: Double
  endDay: Double
  color: string
  /** The row's name label and where it sits in the label column. */
  label: string
  labelAt: Pt
}

export interface GanttLane {
  text: string
  at: Pt
  band: Rect
}

export interface GanttDependency {
  from: string
  to: string
  points: Pt[]
}

export interface GanttLayout {
  rows: GanttRow[]
  lanes: GanttLane[]
  dependencies: GanttDependency[]
  ticks: GanttTick[]
  unit: 'day' | 'week' | 'month' | 'quarter' | 'year'
  /** The time axis strip at the top. */
  axis: Rect
  /** The bar area (right of the labels, under the axis). */
  plot: Rect
  /** Days since 1970-01-01. */
  domain: Domain
  /** Whether a today marker was placed, and where. */
  hasToday: boolean
  todayX: Double
  rowHeight: Double
}

/** An explicit time domain, ISO dates. */
export interface GanttRange {
  start: string
  end: string
}

export interface GanttOptions {
  rowHeight?: Double | undefined
  /** Max label column width as a fraction of the box; default 0.35. */
  labelFraction?: Double | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  gridColor?: string | undefined
  /** ISO date drawn as a vertical marker; omit for none. */
  today?: string | undefined
  todayColor?: string | undefined
  /** Fixed time domain; default the tasks' extent padded by a quarter unit. */
  domain?: GanttRange | undefined
  showDependencies?: boolean | undefined
  /** Entrance progress 0..1; bars grow from their start. */
  progress?: Double | undefined
  palette?: string[] | undefined
}

/** The tick unit for a span in days. */
function ganttUnitFor(spanDays: Double): 'day' | 'week' | 'month' | 'quarter' | 'year' {
  if (spanDays <= 21.0) return 'day'
  if (spanDays <= 120.0) return 'week'
  if (spanDays <= 730.0) return 'month'
  if (spanDays <= 3000.0) return 'quarter'
  return 'year'
}

/** A unit's nominal length in days (months and quarters approximate). */
function ganttUnitDays(unit: 'day' | 'week' | 'month' | 'quarter' | 'year'): Double {
  if (unit === 'day') return 1.0
  if (unit === 'week') return 7.0
  if (unit === 'month') return 30.0
  if (unit === 'quarter') return 91.0
  return 365.0
}

/** Month name for a 1-based month number. */
function ganttMonthName(month: Double): string {
  let mi = 0
  let miF = 1.0
  while (miF < month) {
    mi = mi + 1
    miF = miF + 1.0
  }
  return GANTT_MONTHS[mi]!
}

/** The first tick instant at or before `lo`, aligned to the unit's calendar boundary. */
function ganttAlignStart(lo: Double, unit: 'day' | 'week' | 'month' | 'quarter' | 'year'): Double {
  const day = Math.floor(lo)
  const c = civilFromDays(day)
  if (unit === 'day') return day
  if (unit === 'week') {
    const back = weekdayOfDays(day) + 6.0
    return day - (back - Math.floor(back / 7.0) * 7.0)
  }
  if (unit === 'month') return daysFromCivil(c.year, c.month, 1.0)
  if (unit === 'quarter') {
    const off = c.month - 1.0
    return daysFromCivil(c.year, c.month - (off - Math.floor(off / 3.0) * 3.0), 1.0)
  }
  return daysFromCivil(c.year, 1.0, 1.0)
}

/** The tick after `t` for a calendar-stepped unit. */
function ganttNextTick(t: Double, unit: 'day' | 'week' | 'month' | 'quarter' | 'year'): Double {
  if (unit === 'day') return t + 1.0
  if (unit === 'week') return t + 7.0
  const c = civilFromDays(t)
  if (unit === 'month') return c.month >= 12.0 ? daysFromCivil(c.year + 1.0, 1.0, 1.0) : daysFromCivil(c.year, c.month + 1.0, 1.0)
  if (unit === 'quarter') return c.month >= 10.0 ? daysFromCivil(c.year + 1.0, c.month - 9.0, 1.0) : daysFromCivil(c.year, c.month + 3.0, 1.0)
  return daysFromCivil(c.year + 1.0, 1.0, 1.0)
}

/** Tick instants (days) for a unit across [lo, hi], aligned to calendar boundaries; `x` is filled by the layout. */
export function ganttTicks(lo: Double, hi: Double, unit: 'day' | 'week' | 'month' | 'quarter' | 'year'): GanttTick[] {
  const out: GanttTick[] = []
  const sameYear = civilFromDays(Math.floor(lo)).year === civilFromDays(Math.floor(hi)).year
  let t = ganttAlignStart(lo, unit)
  let guard = 0
  while (t <= hi && guard < 400) {
    guard = guard + 1
    if (t >= lo) {
      const c = civilFromDays(t)
      const q = Math.floor((c.month - 1.0) / 3.0) + 1.0
      const year = `${Math.round(c.year)}`
      const label =
        unit === 'day' || unit === 'week'
          ? `${Math.round(c.day)} ${ganttMonthName(c.month)}`
          : unit === 'month'
            ? (sameYear ? ganttMonthName(c.month) : `${ganttMonthName(c.month)} ${year}`)
            : unit === 'quarter'
              ? `Q${Math.round(q)} ${year}`
              : year
      out.push({ at: t, x: 0.0, label })
    }
    t = ganttNextTick(t, unit)
  }
  return out
}

/** Row index by task id, or -1. */
function ganttRowIndex(rows: GanttRow[], id: string): number {
  let found = -1
  for (let i = 0; i < rows.length; i++) if (found < 0 && rows[i]!.task.id === id) found = i
  return found
}

/** Lay tasks out in `box`: labels left, time axis on top, one row per task, lane headers between groups. */
export function layoutGantt(tasks: GanttTask[], box: Rect, options?: GanttOptions, measure?: MeasureText): GanttLayout {
  const fontSize = options?.fontSize ?? 12.0
  const m: MeasureText = measure ?? approxTextWidth
  const palette = options?.palette ?? GANTT_PALETTE
  const sDay: Double[] = []
  const eDay: Double[] = []
  for (const task of tasks) {
    const ps = parseIsoDays(task.start)
    const s = ps.ok ? ps.days : 0.0
    const pe = parseIsoDays(task.end ?? '')
    const eRaw = pe.ok ? pe.days : s
    const e = task.milestone === true ? s : eRaw < s ? s : eRaw
    sDay.push(s)
    eDay.push(e)
  }
  let lo = 0.0
  let hi = 0.0
  let seen = false
  for (let i = 0; i < sDay.length; i++) {
    if (!seen || sDay[i]! < lo) lo = sDay[i]!
    if (!seen || eDay[i]! > hi) hi = eDay[i]!
    seen = true
  }
  if (!seen) {
    lo = daysFromCivil(2024.0, 1.0, 1.0)
    hi = lo + 30.0
  }
  if (hi <= lo) hi = lo + 1.0
  const pToday = parseIsoDays(options?.today ?? '')
  const hasToday = pToday.ok
  const todayDay = pToday.days
  if (hasToday) {
    if (todayDay < lo) lo = todayDay
    if (todayDay > hi) hi = todayDay
  }
  const pA = parseIsoDays(options?.domain?.start ?? '')
  const pB = parseIsoDays(options?.domain?.end ?? '')
  const explicit = pA.ok && pB.ok && pB.days > pA.days
  if (explicit) {
    lo = pA.days
    hi = pB.days
  } else {
    // Pad by a fraction of a unit so the first and last bars don't touch the edges.
    const pad = ganttUnitDays(ganttUnitFor(hi - lo)) * 0.25
    lo = lo - pad
    hi = hi + pad
  }
  const unit = ganttUnitFor(hi - lo)
  // Label column: the widest name (or lane) capped at labelFraction of the box.
  let labelW = 0.0
  for (const task of tasks) {
    const w = m(task.name, fontSize)
    if (w > labelW) labelW = w
  }
  const groups: string[] = []
  for (const task of tasks) {
    const g = task.group ?? ''
    if (g === '') continue
    let known = false
    for (const k of groups) if (k === g) known = true
    if (!known) groups.push(g)
  }
  for (const g of groups) {
    const w = m(g, fontSize + 1.0)
    if (w > labelW) labelW = w
  }
  const cap = box.w * (options?.labelFraction ?? 0.35)
  const labelCol = labelW + 16.0 < cap ? labelW + 16.0 : cap
  const axisH = fontSize + 12.0
  const axisW = box.w - labelCol
  const axis: Rect = { x: box.x + labelCol, y: box.y, w: axisW < 0.0 ? 0.0 : axisW, h: axisH }
  // Rows: one per task plus one header per group change.
  let lineCount = 0.0
  let lastGroup = ''
  for (const task of tasks) {
    const g = task.group ?? ''
    if (g !== '' && g !== lastGroup) {
      lineCount = lineCount + 1.0
      lastGroup = g
    }
    lineCount = lineCount + 1.0
  }
  const availRaw = box.h - axisH
  const avail = availRaw < 0.0 ? 0.0 : availRaw
  const fitRow = lineCount <= 0.0 ? 28.0 : avail / lineCount
  const clampedRow = fitRow < 12.0 ? 12.0 : fitRow > 28.0 ? 28.0 : fitRow
  const rowHeight = options?.rowHeight ?? clampedRow
  const plotH = rowHeight * lineCount
  const plot: Rect = { x: axis.x, y: box.y + axisH, w: axis.w, h: avail > plotH ? avail : plotH }
  const span = hi - lo
  const rows: GanttRow[] = []
  const lanes: GanttLane[] = []
  let y = plot.y
  let laneGroup = ''
  const labelX = box.x + (groups.length > 0 ? 14.0 : 4.0)
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!
    const g = task.group ?? ''
    if (g !== '' && g !== laneGroup) {
      lanes.push({ text: g, at: { x: box.x + 4.0, y: y + rowHeight / 2.0 }, band: { x: box.x, y, w: box.w, h: rowHeight } })
      y = y + rowHeight
      laneGroup = g
    }
    const x0 = plot.x + ((sDay[i]! - lo) / span) * plot.w
    const x1 = plot.x + ((eDay[i]! - lo) / span) * plot.w
    const barRaw = rowHeight * 0.6
    const barH = barRaw < 4.0 ? 4.0 : barRaw
    const isMilestone = task.milestone === true || eDay[i]! === sDay[i]!
    const bw = x1 - x0 < 1.0 ? 1.0 : x1 - x0
    const rect: Rect = isMilestone ? { x: x0 - barH / 2.0, y: y + (rowHeight - barH) / 2.0, w: barH, h: barH } : { x: x0, y: y + (rowHeight - barH) / 2.0, w: bw, h: barH }
    rows.push({
      task,
      index: i,
      rect,
      band: { x: box.x, y, w: box.w, h: rowHeight },
      startDay: sDay[i]!,
      endDay: eDay[i]!,
      color: task.color ?? palette[i % palette.length]!,
      label: task.name,
      labelAt: { x: labelX, y: y + rowHeight / 2.0 },
    })
    y = y + rowHeight
  }
  const dependencies: GanttDependency[] = []
  for (const row of rows) {
    const deps = row.task.dependencies ?? []
    for (const dep of deps) {
      const fi = ganttRowIndex(rows, dep)
      if (fi < 0) continue
      const from = rows[fi]!
      const fx = from.rect.x + from.rect.w
      const fy = from.rect.y + from.rect.h / 2.0
      const tx = row.rect.x
      const ty = row.rect.y + row.rect.h / 2.0
      const points: Pt[] = []
      points.push({ x: fx, y: fy })
      if (fx + 8.0 <= tx) {
        points.push({ x: fx + 8.0, y: fy })
        points.push({ x: fx + 8.0, y: ty })
      } else {
        const above = ty - row.rect.h / 2.0 - 2.0
        points.push({ x: fx + 8.0, y: fy })
        points.push({ x: fx + 8.0, y: above })
        points.push({ x: tx - 8.0, y: above })
        points.push({ x: tx - 8.0, y: ty })
      }
      points.push({ x: tx, y: ty })
      dependencies.push({ from: dep, to: row.task.id, points })
    }
  }
  const ticks: GanttTick[] = []
  for (const t of ganttTicks(lo, hi, unit)) ticks.push({ at: t.at, x: plot.x + ((t.at - lo) / span) * plot.w, label: t.label })
  return {
    rows,
    lanes,
    dependencies,
    ticks,
    unit,
    axis,
    plot,
    domain: { min: lo, max: hi },
    hasToday,
    todayX: hasToday ? plot.x + ((todayDay - lo) / span) * plot.w : 0.0,
    rowHeight,
  }
}

/** Render: lane bands, grid lines, axis labels, bars with progress fills, milestones, dependencies, the today line. */
export function renderGantt(layout: GanttLayout, options?: GanttOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const fontSize = options?.fontSize ?? 12.0
  const labelColor = options?.labelColor ?? '#374151'
  const gridColor = options?.gridColor ?? '#e5e7eb'
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const showDeps = options?.showDependencies ?? true
  for (const lane of layout.lanes) {
    out.push({ kind: 'rect', rect: lane.band, fill: '#f3f4f6' })
    out.push({ kind: 'text', text: lane.text, at: lane.at, fill: labelColor, size: fontSize + 1.0, align: 'start', baseline: 'middle' })
  }
  const plotBottom = layout.plot.y + layout.plot.h
  for (const t of layout.ticks) {
    out.push({ kind: 'line', from: { x: t.x, y: layout.axis.y + layout.axis.h }, to: { x: t.x, y: plotBottom }, stroke: gridColor, width: 1.0 })
    out.push({ kind: 'text', text: t.label, at: { x: t.x + 3.0, y: layout.axis.y + layout.axis.h / 2.0 }, fill: labelColor, size: fontSize - 1.0, align: 'start', baseline: 'middle' })
  }
  for (const row of layout.rows) {
    out.push({ kind: 'text', text: row.label, at: row.labelAt, fill: labelColor, size: fontSize, align: 'start', baseline: 'middle' })
    const r = row.rect
    if (row.task.milestone === true || row.endDay === row.startDay) {
      const cx = r.x + r.w / 2.0
      const cy = r.y + r.h / 2.0
      const hw = (r.w / 2.0) * progress
      const diamond: Pt[] = []
      diamond.push({ x: cx, y: cy - hw })
      diamond.push({ x: cx + hw, y: cy })
      diamond.push({ x: cx, y: cy + hw })
      diamond.push({ x: cx - hw, y: cy })
      out.push({ kind: 'polygon', points: diamond, fill: row.color })
      continue
    }
    const w = r.w * progress
    out.push({ kind: 'rect', rect: { x: r.x, y: r.y, w, h: r.h }, fill: row.color })
    const done = row.task.progress ?? 0.0
    if (done > 0.0) {
      const dw = w * (done > 1.0 ? 1.0 : done)
      out.push({ kind: 'rect', rect: { x: r.x, y: r.y + r.h * 0.25, w: dw, h: r.h * 0.5 }, fill: 'rgba(0,0,0,0.35)' })
    }
  }
  if (progress >= 1.0 && showDeps) {
    for (const d of layout.dependencies) out.push({ kind: 'polyline', points: d.points, stroke: '#6b7280', width: 1.0 })
  }
  if (layout.hasToday) {
    out.push({ kind: 'line', from: { x: layout.todayX, y: layout.axis.y }, to: { x: layout.todayX, y: plotBottom }, stroke: options?.todayColor ?? '#dc2626', width: 1.5, dash: [4.0, 3.0] })
  }
  return out
}

/** Index of the task whose bar (or, failing that, whose row band right of the labels) is under a point, or -1. */
export function hitGanttIndex(layout: GanttLayout, px: Double, py: Double): number {
  let hit = -1
  for (let i = 0; i < layout.rows.length; i++) {
    if (hit >= 0) continue
    const r = layout.rows[i]!.rect
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) hit = i
  }
  if (hit >= 0) return hit
  for (let i = 0; i < layout.rows.length; i++) {
    if (hit >= 0) continue
    const b = layout.rows[i]!.band
    if (px >= layout.plot.x && py >= b.y && py <= b.y + b.h) hit = i
  }
  return hit
}

/** Whole days between a row's start and end (0 for a milestone). */
export function ganttDurationDays(row: GanttRow): Double {
  const raw = row.endDay - row.startDay
  const f = Math.floor(raw)
  return raw - f < 0.5 ? f : f + 1.0
}

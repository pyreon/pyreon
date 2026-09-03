// Gantt geometry — one row per task on a shared time axis, with progress
// fills, milestones (diamonds), dependency elbows and a today marker. Pure:
// dates in, rects and commands out; the host and `ganttToSvg` both consume it.

import { formatIsoDate, parseIsoDate } from './calendar'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

const DAY_MS = 86400000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']

export interface GanttTask {
  id: string
  name: string
  /** ISO `YYYY-MM-DD` or epoch ms. */
  start: string | Double
  /** ISO `YYYY-MM-DD` or epoch ms; a milestone may omit it (or equal `start`). */
  end?: string | Double | undefined
  /** 0..1 done fraction; drawn as a darker inner bar. */
  progress?: Double | undefined
  /** Ids of tasks this one depends on; drawn as elbows from their end to this start. */
  dependencies?: string[] | undefined
  /** Lane header the task sits under; consecutive tasks with the same group share one header row. */
  group?: string | undefined
  color?: string | undefined
  milestone?: boolean | undefined
}

export type GanttTickUnit = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface GanttTick {
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
  startMs: Double
  endMs: Double
  color: string
  label: { text: string; at: Pt }
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
  unit: GanttTickUnit
  /** The time axis strip at the top. */
  axis: Rect
  /** The bar area (right of the labels, under the axis). */
  plot: Rect
  domain: [Double, Double]
  today: { x: Double } | null
  rowHeight: Double
}

export interface GanttOptions {
  rowHeight?: Double | undefined
  /** Max label column width as a fraction of the box; default 0.35. */
  labelFraction?: Double | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  gridColor?: string | undefined
  /** ISO date drawn as a vertical marker; omit for none. */
  today?: string | Double | undefined
  todayColor?: string | undefined
  /** Fixed time domain (ISO or ms); default the tasks' extent padded by one unit. */
  domain?: [string | Double, string | Double] | undefined
  showDependencies?: boolean | undefined
  /** Entrance progress 0..1; bars grow from their start. */
  progress?: Double | undefined
  palette?: string[] | undefined
}

const toMs = (v: string | Double | undefined): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const iso = parseIsoDate(v)
    if (iso !== null) return iso
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : null
  }
  return null
}

const unitFor = (spanDays: Double): GanttTickUnit =>
  spanDays <= 21 ? 'day' : spanDays <= 120 ? 'week' : spanDays <= 730 ? 'month' : spanDays <= 3000 ? 'quarter' : 'year'

const unitMs = (u: GanttTickUnit): Double => (u === 'day' ? DAY_MS : u === 'week' ? 7 * DAY_MS : u === 'month' ? 30 * DAY_MS : u === 'quarter' ? 91 * DAY_MS : 365 * DAY_MS)

/** Tick instants for a unit across [lo, hi], aligned to calendar boundaries in UTC. */
export function ganttTicks(lo: Double, hi: Double, unit: GanttTickUnit): { at: Double; label: string }[] {
  const out: { at: Double; label: string }[] = []
  const d = new Date(lo)
  let y = d.getUTCFullYear()
  let m = d.getUTCMonth()
  let t: Double
  if (unit === 'day' || unit === 'week') {
    t = Date.UTC(y, m, d.getUTCDate())
    if (unit === 'week') t = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS
  } else if (unit === 'month') t = Date.UTC(y, m, 1)
  else if (unit === 'quarter') t = Date.UTC(y, m - (m % 3), 1)
  else t = Date.UTC(y, 0, 1)
  const step = unit === 'day' ? DAY_MS : unit === 'week' ? 7 * DAY_MS : 0
  const sameYear = new Date(lo).getUTCFullYear() === new Date(hi).getUTCFullYear()
  let guard = 0
  while (t <= hi && guard < 400) {
    guard++
    if (t >= lo) {
      const dt = new Date(t)
      const label =
        unit === 'day' || unit === 'week'
          ? String(dt.getUTCDate()) + ' ' + MONTHS[dt.getUTCMonth()]!
          : unit === 'month'
            ? MONTHS[dt.getUTCMonth()]! + (sameYear ? '' : ' ' + String(dt.getUTCFullYear()))
            : unit === 'quarter'
              ? 'Q' + String(Math.floor(dt.getUTCMonth() / 3) + 1) + ' ' + String(dt.getUTCFullYear())
              : String(dt.getUTCFullYear())
      out.push({ at: t, label })
    }
    if (step > 0) t = t + step
    else {
      const dt = new Date(t)
      y = dt.getUTCFullYear()
      m = dt.getUTCMonth()
      t = unit === 'month' ? Date.UTC(y, m + 1, 1) : unit === 'quarter' ? Date.UTC(y, m + 3, 1) : Date.UTC(y + 1, 0, 1)
    }
  }
  return out
}

/** Lay tasks out in `box`: labels left, time axis on top, one row per task, lane headers between groups. */
export function layoutGantt(tasks: GanttTask[], box: Rect, options?: GanttOptions, measure?: MeasureText): GanttLayout {
  const fontSize = options?.fontSize ?? 12.0
  const m = measure ?? measureApprox()
  const palette = options?.palette ?? PALETTE
  const parsed = tasks.map((task) => {
    const s = toMs(task.start) ?? 0
    const e = task.milestone === true ? s : Math.max(s, toMs(task.end) ?? s)
    return { task, s, e }
  })
  let lo = Infinity
  let hi = -Infinity
  for (const p of parsed) {
    if (p.s < lo) lo = p.s
    if (p.e > hi) hi = p.e
  }
  if (lo === Infinity) {
    lo = Date.UTC(2024, 0, 1)
    hi = lo + 30 * DAY_MS
  }
  if (hi <= lo) hi = lo + DAY_MS
  const todayMs = toMs(options?.today)
  if (todayMs !== null) {
    if (todayMs < lo) lo = todayMs
    if (todayMs > hi) hi = todayMs
  }
  let unit = unitFor((hi - lo) / DAY_MS)
  const explicit = options?.domain
  if (explicit !== undefined) {
    const a = toMs(explicit[0])
    const b = toMs(explicit[1])
    if (a !== null && b !== null && b > a) {
      lo = a
      hi = b
      unit = unitFor((hi - lo) / DAY_MS)
    }
  } else {
    // Pad by a fraction of a unit so the first and last bars don't touch the edges.
    const pad = unitMs(unit) * 0.25
    lo = lo - pad
    hi = hi + pad
  }
  // Label column: the widest name (or lane) capped at labelFraction of the box.
  let labelW = 0.0
  for (const p of parsed) labelW = Math.max(labelW, m(p.task.name, fontSize))
  const lanesText = new Set<string>()
  for (const p of parsed) if (p.task.group !== undefined) lanesText.add(p.task.group)
  for (const g of lanesText) labelW = Math.max(labelW, m(g, fontSize + 1.0))
  const labelCol = Math.min(labelW + 16.0, box.w * (options?.labelFraction ?? 0.35))
  const axisH = fontSize + 12.0
  const axis: Rect = { x: box.x + labelCol, y: box.y, w: Math.max(0.0, box.w - labelCol), h: axisH }
  // Rows: one per task plus one header per group change.
  let lineCount = 0
  let lastGroup: string | undefined = undefined
  for (const p of parsed) {
    if (p.task.group !== undefined && p.task.group !== lastGroup) {
      lineCount++
      lastGroup = p.task.group
    }
    lineCount++
  }
  const avail = Math.max(0.0, box.h - axisH)
  const rowHeight = options?.rowHeight ?? Math.max(12.0, Math.min(28.0, lineCount === 0 ? 28.0 : avail / lineCount))
  const plot: Rect = { x: axis.x, y: box.y + axisH, w: axis.w, h: Math.max(avail, rowHeight * lineCount) }
  const span = hi - lo
  const xOf = (t: Double): Double => plot.x + ((t - lo) / span) * plot.w
  const rows: GanttRow[] = []
  const lanes: GanttLane[] = []
  let y = plot.y
  lastGroup = undefined
  const byId = new Map<string, GanttRow>()
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]!
    if (p.task.group !== undefined && p.task.group !== lastGroup) {
      lanes.push({ text: p.task.group, at: { x: box.x + 4.0, y: y + rowHeight / 2.0 }, band: { x: box.x, y, w: box.w, h: rowHeight } })
      y = y + rowHeight
      lastGroup = p.task.group
    }
    const x0 = xOf(p.s)
    const x1 = xOf(p.e)
    const barH = Math.max(4.0, rowHeight * 0.6)
    const isMilestone = p.task.milestone === true || p.e === p.s
    const rect: Rect = isMilestone
      ? { x: x0 - barH / 2.0, y: y + (rowHeight - barH) / 2.0, w: barH, h: barH }
      : { x: x0, y: y + (rowHeight - barH) / 2.0, w: Math.max(1.0, x1 - x0), h: barH }
    const row: GanttRow = {
      task: p.task,
      index: i,
      rect,
      band: { x: box.x, y, w: box.w, h: rowHeight },
      startMs: p.s,
      endMs: p.e,
      color: p.task.color ?? palette[i % palette.length]!,
      label: { text: p.task.name, at: { x: box.x + (lanesText.size > 0 ? 14.0 : 4.0), y: y + rowHeight / 2.0 } },
    }
    rows.push(row)
    byId.set(p.task.id, row)
    y = y + rowHeight
  }
  const dependencies: GanttDependency[] = []
  for (const row of rows) {
    for (const dep of row.task.dependencies ?? []) {
      const from = byId.get(dep)
      if (from === undefined) continue
      const fx = from.rect.x + from.rect.w
      const fy = from.rect.y + from.rect.h / 2.0
      const tx = row.rect.x
      const ty = row.rect.y + row.rect.h / 2.0
      const midX = fx + 8.0
      const points: Pt[] = fx + 8.0 <= tx ? [{ x: fx, y: fy }, { x: midX, y: fy }, { x: midX, y: ty }, { x: tx, y: ty }] : [{ x: fx, y: fy }, { x: fx + 8.0, y: fy }, { x: fx + 8.0, y: ty - row.rect.h / 2.0 - 2.0 }, { x: tx - 8.0, y: ty - row.rect.h / 2.0 - 2.0 }, { x: tx - 8.0, y: ty }, { x: tx, y: ty }]
      dependencies.push({ from: dep, to: row.task.id, points })
    }
  }
  const ticks: GanttTick[] = ganttTicks(lo, hi, unit).map((t) => ({ at: t.at, x: xOf(t.at), label: t.label }))
  return {
    rows,
    lanes,
    dependencies,
    ticks,
    unit,
    axis,
    plot,
    domain: [lo, hi],
    today: todayMs === null ? null : { x: xOf(todayMs) },
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
    out.push({ kind: 'text', text: row.label.text, at: row.label.at, fill: labelColor, size: fontSize, align: 'start', baseline: 'middle' })
    const r = row.rect
    if (row.task.milestone === true || row.endMs === row.startMs) {
      const cx = r.x + r.w / 2.0
      const cy = r.y + r.h / 2.0
      const hw = (r.w / 2.0) * progress
      out.push({ kind: 'polygon', points: [{ x: cx, y: cy - hw }, { x: cx + hw, y: cy }, { x: cx, y: cy + hw }, { x: cx - hw, y: cy }], fill: row.color })
      continue
    }
    const w = r.w * progress
    out.push({ kind: 'rect', rect: { x: r.x, y: r.y, w, h: r.h }, fill: row.color })
    const done = row.task.progress
    if (done !== undefined && done > 0.0) {
      const dw = w * Math.min(1.0, done)
      out.push({ kind: 'rect', rect: { x: r.x, y: r.y + r.h * 0.25, w: dw, h: r.h * 0.5 }, fill: 'rgba(0,0,0,0.35)' })
    }
  }
  if (progress >= 1.0 && options?.showDependencies !== false) {
    for (const d of layout.dependencies) out.push({ kind: 'polyline', points: d.points, stroke: '#6b7280', width: 1.0 })
  }
  if (layout.today !== null) {
    out.push({ kind: 'line', from: { x: layout.today.x, y: layout.axis.y }, to: { x: layout.today.x, y: plotBottom }, stroke: options?.todayColor ?? '#dc2626', width: 1.5, dash: [4.0, 3.0] })
  }
  return out
}

/** The task whose bar (or, failing that, whose row band right of the labels) is under a point. */
export function hitGantt(layout: GanttLayout, px: Double, py: Double): GanttRow | null {
  for (const row of layout.rows) {
    const r = row.rect
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return row
  }
  for (const row of layout.rows) {
    const b = row.band
    if (px >= layout.plot.x && py >= b.y && py <= b.y + b.h) return row
  }
  return null
}

/** Whole days between a row's start and end (0 for a milestone). */
export function ganttDurationDays(row: GanttRow): Double {
  return Math.round((row.endMs - row.startMs) / DAY_MS)
}

export interface GanttToSvgOptions {
  tasks: GanttTask[]
  width?: Double
  height?: Double
  gantt?: GanttOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Gantt → `<svg>` string, server-safe. */
export function ganttToSvg(options: GanttToSvgOptions): string {
  const width = options.width ?? 720.0
  const height = options.height ?? 320.0
  const measure = options.measure ?? measureApprox()
  const layout = layoutGantt(options.tasks, { x: 4.0, y: 4.0, w: width - 8.0, h: height - 8.0 }, options.gantt, measure)
  const cmds = renderGantt(layout, options.gantt)
  const description =
    options.description ??
    (options.title !== undefined
      ? `${options.title}: ${layout.rows.length} tasks from ${formatIsoDate(layout.domain[0])} to ${formatIsoDate(layout.domain[1])}.`
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// pyreon-lint-disable-file pyreon/no-window-in-ssr, pyreon/no-raw-addeventlistener -- the pointer layer exists only in a browser (it is attached in onMount and its functions run from pointer events), and it owns its listeners and removes every one in the cleanup it returns
import type { Calendar } from './calendar-types'
import { moveTarget, resizeTarget } from './edit'
import type { Hit, Target } from './edit'
import type { PlainDate } from './types'

const SLOP = 4
const LONG_PRESS_MS = 350
const TOUCH_SLOP = 8
const EDGE = 36
const SCROLL_STEP = 14
const CELL = '.pcal-slot, .pcal-day, .pcal-allday-cell, .pcal-tl-lane'

interface Where {
  hit: Hit
  cell: HTMLElement
  /** In the timeline: the row under the pointer. */
  resourceId?: string
  /** The minute the slot under the pointer starts at (the unit of a selection). */
  slotStart?: number
}

interface Session {
  id: number
  kind: 'move' | 'resize' | 'select'
  /** The element that holds the pointer capture. */
  holder: HTMLElement
  el: HTMLElement | null
  key: string
  edge: 'start' | 'end'
  grab: Hit
  /** The row a bar was taken from (timeline). */
  fromResource: string | undefined
  startX: number
  startY: number
  x: number
  y: number
  started: boolean
  origin: DOMRect | null
  originCell: HTMLElement | null
  saved: string
  timer: number
  last: Target | null
  anchor: Hit
  anchorSlot: number
  type: string
}

/** What the handlers share: the grid element, the calendar and the one drag that may be going on. */
interface Ctx<Meta> {
  root: HTMLElement
  calendar: Calendar<Meta>
  grid: 'month' | 'time' | 'timeline'
  session: Session | null
  frame: number
  swallow: boolean
  onEscape: (event: KeyboardEvent) => void
}

function whereAt<Meta>(c: Ctx<Meta>, x: number, y: number): Where | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement) || !c.root.contains(el) || !el.matches(CELL) || (el.dataset.date === undefined && el.dataset.resource === undefined)) continue
    if (el.classList.contains('pcal-tl-lane')) return laneAt(c, el, x)
    const date = el.dataset.date as PlainDate
    if (el.dataset.minute === undefined) return { hit: { date, minute: null }, cell: el }
    const rect = el.getBoundingClientRect()
    const slot = c.calendar.timeGrid().slot

    return { hit: { date, minute: Number(el.dataset.minute) + Math.min(1, Math.max(0, (y - rect.top) / rect.height)) * slot }, cell: el, slotStart: Number(el.dataset.minute) }
  }

  return null
}

/** The day and minute under a point of a timeline row: the shown days side by side along the lane, each its visible hours. */
function laneAt<Meta>(c: Ctx<Meta>, lane: HTMLElement, x: number): Where | null {
  const { dates, from, to } = c.calendar.timeline()
  if (dates.length === 0) return null
  const rect = lane.getBoundingClientRect()
  const flip = getComputedStyle(c.root).direction === 'rtl'
  const frac = Math.min(1, Math.max(0, ((flip ? rect.right - x : x - rect.left) / rect.width)))
  const size = to - from
  const pos = Math.min(frac * dates.length * size, dates.length * size - 1e-6)
  const index = Math.floor(pos / size)

  return { hit: { date: dates[index] as PlainDate, minute: from + pos - index * size }, cell: lane, resourceId: lane.dataset.resource as string }
}

/** The x of a moment on a lane (the start of a day and a minute of it, or of a date). */
function laneX<Meta>(c: Ctx<Meta>, lane: HTMLElement, value: string, allDay: boolean): number {
  const { dates, from, to } = c.calendar.timeline()
  const rect = lane.getBoundingClientRect()
  const size = to - from
  const index = Math.max(0, dates.indexOf(value.slice(0, 10) as PlainDate))
  const minute = allDay ? 0 : Math.min(size, Math.max(0, Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16)) - from))
  const frac = (index * size + minute) / (dates.length * size)

  return getComputedStyle(c.root).direction === 'rtl' ? rect.right - frac * rect.width : rect.left + frac * rect.width
}

function cellOf<Meta>(c: Ctx<Meta>, date: string, minute: number | null): HTMLElement | null {
  if (minute === null) return c.root.querySelector<HTMLElement>(`${c.grid === 'month' ? '.pcal-day' : '.pcal-allday-cell'}[data-date="${date}"]`)
  const { slot, from } = c.calendar.timeGrid()

  return c.root.querySelector<HTMLElement>(`.pcal-slot[data-date="${date}"][data-minute="${Math.floor((minute - from) / slot) * slot + from}"]`)
}

const clearStyle = (s: Session): void => {
  if (s.el !== null) s.el.style.cssText = s.saved
}

function swallowClick<Meta>(c: Ctx<Meta>): void {
  c.swallow = true
  window.setTimeout(() => {
    c.swallow = false
  }, 0)
}

function finish<Meta>(c: Ctx<Meta>, s: Session): void {
  window.clearTimeout(s.timer)
  cancelAnimationFrame(c.frame)
  c.frame = 0
  if (s.holder.hasPointerCapture(s.id)) s.holder.releasePointerCapture(s.id)
  document.removeEventListener('keydown', c.onEscape, true)
  c.session = null
}

function abort<Meta>(c: Ctx<Meta>): void {
  const s = c.session
  if (s === null) return
  const wasStarted = s.started
  clearStyle(s)
  finish(c, s)
  if (wasStarted && s.kind !== 'select') c.calendar.cancelEdit()
  if (wasStarted) swallowClick(c)
}

/** Where the pixel of a time (a slot cell and a minute inside it) is on screen. */
function yOf<Meta>(c: Ctx<Meta>, value: string, allDay: boolean): { y: number; cell: HTMLElement } | null {
  const date = value.slice(0, 10)
  if (allDay) {
    const cell = cellOf(c, date, null)

    return cell === null ? null : { y: cell.getBoundingClientRect().top, cell }
  }
  const minute = Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16))
  const cell = cellOf(c, date, minute)
  if (cell === null) return null
  const rect = cell.getBoundingClientRect()

  return { y: rect.top + ((minute - Number(cell.dataset.minute)) / c.calendar.timeGrid().slot) * rect.height, cell }
}

/** The cell of the row a bar is in that holds a date, or the row's first or last cell when the date is outside the row. */
function rowCell(s: Session, date: string): HTMLElement | null {
  const row = s.el?.closest('.pcal-week, .pcal-allday')
  if (row === null || row === undefined) return null
  const cells = [...row.querySelectorAll<HTMLElement>('[data-date]')].filter((cell) => cell.matches(CELL))
  const first = cells[0]?.dataset.date
  const last = cells.at(-1)?.dataset.date
  if (first === undefined || last === undefined) return null
  let clamped = date
  if (date < first) clamped = first
  else if (date > last) clamped = last

  return cells.find((cell) => cell.dataset.date === clamped) ?? null
}

const DAY_MS = 86_400_000

/** A bar being resized (month, all-day row): its width and offset follow the cell of the edge, in the reading direction. */
function placeSpan<Meta>(c: Ctx<Meta>, s: Session, target: Target): void {
  const el = s.el as HTMLElement
  const origin = s.origin as DOMRect
  const lastDay = target.allDay ? new Date(Date.parse(`${target.end.slice(0, 10)}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10) : target.end.slice(0, 10)
  const cell = rowCell(s, s.edge === 'end' ? lastDay : target.start.slice(0, 10))
  if (cell === null) return
  const box = cell.getBoundingClientRect()
  const flip = getComputedStyle(c.root).direction === 'rtl'
  const toTheEdge = (s.edge === 'start') !== flip
  const left = toTheEdge ? box.left + 2 : origin.left
  const right = toTheEdge ? origin.right : box.right - 2
  el.style.transform = `translateX(${left - origin.left}px)`
  el.style.width = `${Math.max(8, right - left)}px`
}

/** A bar of the timeline follows the target: along the lane in time, across the rows to its resource. */
function placeTimeline<Meta>(c: Ctx<Meta>, s: Session, target: Target): void {
  const el = s.el as HTMLElement
  const origin = s.origin as DOMRect
  const row = target.resourceId ?? s.fromResource
  const lane = c.root.querySelector<HTMLElement>(`.pcal-tl-lane[data-resource="${CSS.escape(row ?? '')}"]`)
  const fromLane = s.originCell
  if (lane === null || fromLane === null) return
  const a = laneX(c, lane, target.start, target.allDay)
  const b = laneX(c, lane, target.end, target.allDay)
  const left = Math.min(a, b)
  const right = Math.max(a, b)
  const dy = lane.getBoundingClientRect().top - fromLane.getBoundingClientRect().top
  if (s.kind === 'move') {
    const flip = getComputedStyle(c.root).direction === 'rtl'
    el.style.transform = `translate(${(flip ? right - origin.right : left - origin.left)}px, ${dy}px)`

    return
  }
  el.style.transform = `translateX(${left - origin.left}px)`
  el.style.width = `${Math.max(8, right - left)}px`
}

/** Show the dragged element where the target is: a transform (and a height for a resize), snapped to the cell. Nothing else is laid out. */
function place<Meta>(c: Ctx<Meta>, s: Session, target: Target): void {
  const el = s.el
  const origin = s.origin
  if (el === null || origin === null || s.originCell === null) return
  if (c.grid === 'timeline') return placeTimeline(c, s, target)
  if (s.kind === 'resize' && (c.grid === 'month' || el.classList.contains('pcal-allday-event'))) return placeSpan(c, s, target)
  const top = yOf(c, target.start, target.allDay)
  if (top === null) return
  const dx = top.cell.getBoundingClientRect().left - s.originCell.getBoundingClientRect().left
  if (s.kind === 'move') {
    el.style.transform = `translate(${dx}px, ${top.y - origin.top}px)`

    return
  }
  const end = yOf(c, target.end, target.allDay)
  el.style.transform = `translateY(${top.y - origin.top}px)`
  el.style.height = `${Math.max(8, (end === null ? origin.bottom : end.y) - top.y)}px`
}

function compute<Meta>(c: Ctx<Meta>, s: Session, at: Where): Target | null {
  const o = c.calendar.occurrences().find((x) => x.key === s.key)
  if (o === undefined) return null
  // along a timeline the date is a column, so an all-day event keeps being one
  const hit = c.grid === 'timeline' && o.allDay ? { ...at.hit, minute: null } : at.hit
  const grab = c.grid === 'timeline' && o.allDay ? { ...s.grab, minute: null } : s.grab
  if (s.kind === 'move') {
    const moved = moveTarget(o, hit, grab, c.calendar.snap())

    return c.grid === 'timeline' && at.resourceId !== undefined && at.resourceId !== s.fromResource ? { ...moved, resourceId: at.resourceId, ...(s.fromResource === undefined ? {} : { fromResourceId: s.fromResource }) } : moved
  }

  return resizeTarget(o, s.edge, hit, c.calendar.snap(), c.calendar.minDuration())
}

function update<Meta>(c: Ctx<Meta>, s: Session): void {
  const at = whereAt(c, s.x, s.y)
  if (at === null) {
    s.last = null

    return
  }
  if (s.kind === 'select') {
    c.calendar.select({ date: s.anchor.date, minute: s.anchorSlot }, { date: at.hit.date, minute: at.slotStart ?? 0 }, c.grid === 'month' ? 'month' : 'time')

    return
  }
  const target = compute(c, s, at)
  if (target === null) return
  s.last = target
  c.calendar.previewEdit(target)
  place(c, s, target)
}

/** Scroll the grid when the pointer is near its top or bottom edge, and keep the target following the pointer. */
function autoscroll<Meta>(c: Ctx<Meta>): void {
  const s = c.session
  if (s === null || !s.started) return
  const box = c.root
  if (box.scrollHeight > box.clientHeight + 1) {
    const rect = box.getBoundingClientRect()
    const before = box.scrollTop
    if (s.y < rect.top + EDGE) box.scrollTop -= SCROLL_STEP
    else if (s.y > rect.bottom - EDGE) box.scrollTop += SCROLL_STEP
    if (box.scrollTop !== before) update(c, s)
  }
  c.frame = requestAnimationFrame(() => autoscroll(c))
}

function start<Meta>(c: Ctx<Meta>, s: Session): void {
  if (s.started) return
  s.started = true
  window.clearTimeout(s.timer)
  s.holder.setPointerCapture(s.id)
  if (s.kind !== 'select') {
    if (!c.calendar.beginEdit(s.key, s.kind, 'pointer')) {
      s.started = false
      finish(c, s)

      return
    }
    s.origin = s.el?.getBoundingClientRect() ?? null
    s.saved = s.el?.getAttribute('style') ?? ''
  }
  document.addEventListener('keydown', c.onEscape, true)
  c.frame = requestAnimationFrame(() => autoscroll(c))
  update(c, s)
}

function onDown<Meta>(c: Ctx<Meta>, event: PointerEvent): void {
  if (c.session !== null || (event.pointerType === 'mouse' && event.button !== 0) || !event.isPrimary) return
  const target = event.target instanceof Element ? event.target : null
  if (target === null) return
  const handle = target.closest<HTMLElement>('.pcal-handle')
  const ev = target.closest<HTMLElement>('.pcal-event[data-key]')
  const at = whereAt(c, event.clientX, event.clientY)
  const base = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, started: false, origin: null, originCell: null, saved: '', timer: 0, last: null, type: event.pointerType }
  if (at === null) return
  if (ev === null) {
    if (event.pointerType !== 'touch' && c.grid !== 'timeline') c.session = { ...base, kind: 'select', holder: c.root, el: null, key: '', edge: 'end', grab: at.hit, fromResource: undefined, anchor: at.hit, anchorSlot: at.slotStart ?? 0 }

    return
  }
  const key = ev.dataset.key as string
  const kind = handle === null ? 'move' : 'resize'
  if (!c.calendar.canEdit(key, kind)) return
  const s: Session = { ...base, kind, holder: ev, el: ev, key, edge: (handle?.dataset.edge as 'start' | 'end' | undefined) ?? 'end', grab: at.hit, fromResource: ev.dataset.resource, anchor: at.hit, anchorSlot: at.slotStart ?? 0, originCell: ev.parentElement }
  c.session = s
  if (event.pointerType === 'touch') s.timer = window.setTimeout(() => start(c, s), LONG_PRESS_MS)
}

function onMove<Meta>(c: Ctx<Meta>, event: PointerEvent): void {
  const s = c.session
  if (s === null || event.pointerId !== s.id) return
  s.x = event.clientX
  s.y = event.clientY
  if (s.started) return update(c, s)
  const moved = Math.hypot(s.x - s.startX, s.y - s.startY)
  if (s.type !== 'touch') {
    if (moved >= SLOP) start(c, s)

    return
  }
  // a finger that moves before the long press is scrolling
  if (moved > TOUCH_SLOP) {
    window.clearTimeout(s.timer)
    c.session = null
  }
}

function onUp<Meta>(c: Ctx<Meta>, event: PointerEvent): void {
  const s = c.session
  if (s === null || event.pointerId !== s.id) return
  window.clearTimeout(s.timer)
  if (!s.started) return finish(c, s)
  s.x = event.clientX
  s.y = event.clientY
  update(c, s)
  const target = s.last
  clearStyle(s)
  finish(c, s)
  swallowClick(c)
  if (s.kind === 'select') return
  if (target === null) c.calendar.cancelEdit()
  else void c.calendar.dropEdit(target)
}

/**
 * The pointer layer of a grid: drag an event to move it, drag a handle at its edge to resize it, drag over empty space to select.
 * One delegated `pointerdown` on the grid; pointer events with pointer capture (so a drag that leaves the element or the window
 * keeps reporting), no library. While dragging, the event follows the pointer with a transform and a height, snapped to the cell
 * it would land in, and nothing else is laid out again; the drop asks the app (`calendar.dropEdit`). A mouse drag starts after
 * 4 px of movement, a touch after a long press (a finger that moves first is scrolling); Escape, a cancelled pointer, a drop
 * outside the grid and losing the pointer put everything back. Returns the cleanup: it removes every listener, timer and capture.
 */
export function attachPointer<Meta>(root: HTMLElement, calendar: Calendar<Meta>, grid: 'month' | 'time' | 'timeline'): () => void {
  const c: Ctx<Meta> = { root, calendar, grid, session: null, frame: 0, swallow: false, onEscape: () => undefined }
  c.onEscape = (event) => {
    if (event.key !== 'Escape' || c.session === null) return
    event.preventDefault()
    event.stopPropagation()
    abort(c)
  }
  const ownPointer = (event: Event): boolean => c.session !== null && (event as PointerEvent).pointerId === c.session.id
  const handlers: [string, EventListener, (boolean | AddEventListenerOptions)?][] = [
    ['pointerdown', (e) => onDown(c, e as PointerEvent)],
    ['pointermove', (e) => onMove(c, e as PointerEvent)],
    ['pointerup', (e) => onUp(c, e as PointerEvent)],
    ['pointercancel', (e) => ownPointer(e) && abort(c)],
    ['lostpointercapture', (e) => c.session?.started === true && ownPointer(e) && abort(c)],
    [
      'click',
      (e) => {
        if (!c.swallow) return
        e.stopPropagation()
        e.preventDefault()
      },
      true,
    ],
    // non-passive, so a long-pressed touch drag does not scroll the page
    ['touchmove', (e) => c.session?.started === true && e.cancelable && e.preventDefault(), { passive: false }],
    ['contextmenu', (e) => c.session?.type === 'touch' && e.preventDefault()],
  ]
  for (const [type, handler, options] of handlers) root.addEventListener(type, handler, options)

  return () => {
    if (c.session !== null) abort(c)
    for (const [type, handler, options] of handlers) root.removeEventListener(type, handler, options)
    document.removeEventListener('keydown', c.onEscape, true)
  }
}

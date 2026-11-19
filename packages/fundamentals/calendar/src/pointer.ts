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

interface Where {
  hit: Hit
  cell: HTMLElement
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

const CELL = '.pcal-slot, .pcal-day, .pcal-allday-cell'

/**
 * The pointer layer of a grid: drag an event to move it, drag a handle at its edge to resize it, drag over empty space to select.
 * One delegated `pointerdown` on the grid; pointer events with pointer capture (so a drag that leaves the element or the window
 * keeps reporting), no library. While dragging, the event follows the pointer with a transform and a height, snapped to the cell
 * it would land in, and nothing else is laid out again; the drop asks the app (`calendar.dropEdit`). A mouse drag starts after
 * 4 px of movement, a touch after a long press (a finger that moves first is scrolling); Escape, a cancelled pointer, a drop
 * outside the grid and losing the pointer put everything back. Returns the cleanup: it removes every listener, timer and capture.
 */
export function attachPointer<Meta>(root: HTMLElement, calendar: Calendar<Meta>, grid: 'month' | 'time'): () => void {
  let session: Session | null = null
  let frame = 0
  let swallow = false

  const rtl = (): boolean => getComputedStyle(root).direction === 'rtl'

  const whereAt = (x: number, y: number): Where | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (!(el instanceof HTMLElement) || !root.contains(el) || !el.matches(CELL) || el.dataset.date === undefined) continue
      const date = el.dataset.date as PlainDate
      if (el.dataset.minute === undefined) return { hit: { date, minute: null }, cell: el }
      const rect = el.getBoundingClientRect()
      const slot = calendar.timeGrid().slot

      return { hit: { date, minute: Number(el.dataset.minute) + Math.min(1, Math.max(0, (y - rect.top) / rect.height)) * slot }, cell: el, slotStart: Number(el.dataset.minute) }
    }

    return null
  }

  const cellOf = (date: string, minute: number | null): HTMLElement | null => {
    if (minute === null) return root.querySelector<HTMLElement>(`${grid === 'month' ? '.pcal-day' : '.pcal-allday-cell'}[data-date="${date}"]`)
    const slot = calendar.timeGrid().slot
    const floor = Math.floor((minute - calendar.timeGrid().from) / slot) * slot + calendar.timeGrid().from

    return root.querySelector<HTMLElement>(`.pcal-slot[data-date="${date}"][data-minute="${floor}"]`)
  }

  const clearStyle = (s: Session): void => {
    if (s.el !== null) s.el.style.cssText = s.saved
  }

  const swallowClick = (): void => {
    swallow = true
    window.setTimeout(() => {
      swallow = false
    }, 0)
  }

  const finish = (s: Session): void => {
    window.clearTimeout(s.timer)
    cancelAnimationFrame(frame)
    frame = 0
    if (s.holder.hasPointerCapture(s.id)) s.holder.releasePointerCapture(s.id)
    document.removeEventListener('keydown', onEscape, true)
    session = null
  }

  const abort = (): void => {
    const s = session
    if (s === null) return
    const wasStarted = s.started
    clearStyle(s)
    finish(s)
    if (wasStarted && s.kind !== 'select') calendar.cancelEdit()
    if (wasStarted) swallowClick()
  }

  function onEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || session === null) return
    event.preventDefault()
    event.stopPropagation()
    abort()
  }

  /** Where the pixel of a time (a slot cell and a minute inside it) is on screen. */
  const yOf = (value: string, allDay: boolean): { y: number; cell: HTMLElement } | null => {
    const date = value.slice(0, 10)
    if (allDay) {
      const cell = cellOf(date, null)

      return cell === null ? null : { y: cell.getBoundingClientRect().top, cell }
    }
    const minute = Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16))
    const cell = cellOf(date, minute)
    if (cell === null) return null
    const rect = cell.getBoundingClientRect()

    return { y: rect.top + ((minute - Number(cell.dataset.minute)) / calendar.timeGrid().slot) * rect.height, cell }
  }

  const rowCell = (s: Session, date: string): HTMLElement | null => {
    const row = s.el?.closest('.pcal-week, .pcal-allday')
    if (row === null || row === undefined) return null
    const cells = [...row.querySelectorAll<HTMLElement>('[data-date]')].filter((c) => c.matches(CELL))
    if (cells.length === 0) return null
    const first = cells[0]?.dataset.date as string
    const last = cells.at(-1)?.dataset.date as string
    const clamped = date < first ? first : date > last ? last : date

    return cells.find((c) => c.dataset.date === clamped) ?? null
  }

  const place = (s: Session, target: Target): void => {
    const el = s.el
    const origin = s.origin
    if (el === null || origin === null || s.originCell === null) return
    if (s.kind === 'resize' && (grid === 'month' || el.classList.contains('pcal-allday-event'))) return placeSpan(s, target)
    const start = yOf(target.start, target.allDay)
    if (start === null) return
    const originCell = s.originCell.getBoundingClientRect()
    const dx = start.cell.getBoundingClientRect().left - originCell.left
    if (s.kind === 'move') {
      el.style.transform = `translate(${dx}px, ${start.y - origin.top}px)`

      return
    }
    const end = yOf(target.end, target.allDay)
    const bottom = end === null ? origin.bottom : end.y
    el.style.transform = `translateY(${start.y - origin.top}px)`
    el.style.height = `${Math.max(8, bottom - start.y)}px`
  }

  const placeSpan = (s: Session, target: Target): void => {
    const el = s.el as HTMLElement
    const origin = s.origin as DOMRect
    const dates = target.allDay ? [target.start.slice(0, 10), new Date(Date.parse(`${target.end.slice(0, 10)}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)] : [target.start.slice(0, 10), target.end.slice(0, 10)]
    const cell = rowCell(s, s.edge === 'end' ? (dates[1] as string) : (dates[0] as string))
    if (cell === null) return
    const box = cell.getBoundingClientRect()
    const flip = rtl()
    const atStart = s.edge === 'start'
    const left = atStart !== flip ? box.left + 2 : origin.left
    const right = atStart !== flip ? origin.right : box.right - 2
    el.style.transform = `translateX(${left - origin.left}px)`
    el.style.width = `${Math.max(8, right - left)}px`
  }

  const compute = (s: Session, at: Where): Target | null => {
    const o = calendar.occurrences().find((x) => x.key === s.key)
    if (o === undefined) return null
    if (s.kind === 'move') return moveTarget(o, at.hit, s.grab, calendar.snap())

    return resizeTarget(o, s.edge, at.hit, calendar.snap(), calendar.minDuration())
  }

  const update = (s: Session): void => {
    const at = whereAt(s.x, s.y)
    if (at === null) {
      s.last = null

      return
    }
    if (s.kind === 'select') {
      calendar.select({ date: s.anchor.date, minute: s.anchorSlot }, { date: at.hit.date, minute: at.slotStart ?? 0 }, grid)

      return
    }
    const target = compute(s, at)
    if (target === null) return
    s.last = target
    calendar.previewEdit(target)
    place(s, target)
  }

  const scroller = (): HTMLElement | null => (root.scrollHeight > root.clientHeight + 1 ? root : null)

  const autoscroll = (): void => {
    const s = session
    if (s === null || !s.started) return
    const box = scroller()
    if (box !== null) {
      const rect = box.getBoundingClientRect()
      const before = box.scrollTop
      if (s.y < rect.top + EDGE) box.scrollTop -= SCROLL_STEP
      else if (s.y > rect.bottom - EDGE) box.scrollTop += SCROLL_STEP
      if (box.scrollTop !== before) update(s)
    }
    frame = requestAnimationFrame(autoscroll)
  }

  const start = (s: Session): void => {
    if (s.started) return
    s.started = true
    window.clearTimeout(s.timer)
    s.holder.setPointerCapture(s.id)
    if (s.kind !== 'select') {
      if (!calendar.beginEdit(s.key, s.kind, 'pointer')) {
        s.started = false
        finish(s)

        return
      }
      s.origin = s.el?.getBoundingClientRect() ?? null
      s.saved = s.el?.getAttribute('style') ?? ''
    }
    // an element's `style` attribute is restored from `saved`: cssText would drop nothing, but this keeps the exact original
    document.addEventListener('keydown', onEscape, true)
    frame = requestAnimationFrame(autoscroll)
    update(s)
  }

  const onDown = (event: PointerEvent): void => {
    if (session !== null || (event.pointerType === 'mouse' && event.button !== 0) || !event.isPrimary) return
    const target = event.target instanceof Element ? event.target : null
    if (target === null) return
    const handle = target.closest<HTMLElement>('.pcal-handle')
    const ev = target.closest<HTMLElement>('.pcal-event[data-key]')
    const at = whereAt(event.clientX, event.clientY)
    const base = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, started: false, origin: null, originCell: null, saved: '', timer: 0, last: null, type: event.pointerType }
    if (ev !== null && at !== null) {
      const key = ev.dataset.key as string
      const kind = handle === null ? 'move' : 'resize'
      if (!calendar.canEdit(key, kind)) return
      const s: Session = { ...base, kind, holder: ev, el: ev, key, edge: (handle?.dataset.edge as 'start' | 'end' | undefined) ?? 'end', grab: at.hit, anchor: at.hit, anchorSlot: at.slotStart ?? 0, originCell: ev.parentElement }
      session = s
      if (event.pointerType === 'touch') s.timer = window.setTimeout(() => start(s), LONG_PRESS_MS)

      return
    }
    if (ev === null && at !== null && event.pointerType !== 'touch') {
      session = { ...base, kind: 'select', holder: root, el: null, key: '', edge: 'end', grab: at.hit, anchor: at.hit, anchorSlot: at.slotStart ?? 0 }
    }
  }

  const onMove = (event: PointerEvent): void => {
    const s = session
    if (s === null || event.pointerId !== s.id) return
    s.x = event.clientX
    s.y = event.clientY
    const moved = Math.hypot(s.x - s.startX, s.y - s.startY)
    if (!s.started) {
      if (s.type === 'touch') {
        if (moved > TOUCH_SLOP) {
          window.clearTimeout(s.timer)
          session = null
        }

        return
      }
      if (moved < SLOP) return
      start(s)

      return
    }
    update(s)
  }

  const onUp = (event: PointerEvent): void => {
    const s = session
    if (s === null || event.pointerId !== s.id) return
    window.clearTimeout(s.timer)
    if (!s.started) {
      finish(s)

      return
    }
    s.x = event.clientX
    s.y = event.clientY
    update(s)
    const target = s.last
    clearStyle(s)
    finish(s)
    swallowClick()
    if (s.kind === 'select') return
    if (target === null) calendar.cancelEdit()
    else void calendar.dropEdit(target)
  }

  const onCancel = (event: PointerEvent): void => {
    if (session !== null && event.pointerId === session.id) abort()
  }

  const onLost = (event: PointerEvent): void => {
    if (session !== null && event.pointerId === session.id && session.started) abort()
  }

  const onClick = (event: MouseEvent): void => {
    if (!swallow) return
    event.stopPropagation()
    event.preventDefault()
  }

  const onTouchMove = (event: TouchEvent): void => {
    if (session?.started === true && event.cancelable) event.preventDefault()
  }

  const onContextMenu = (event: Event): void => {
    if (session !== null && session.type === 'touch') event.preventDefault()
  }

  // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- the pointer layer owns these listeners on the grid element it is attached to; the returned cleanup removes every one of them
  root.addEventListener('pointerdown', onDown)
  // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- same
  root.addEventListener('pointermove', onMove)
  // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- same
  root.addEventListener('pointerup', onUp)
  // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- same
  root.addEventListener('pointercancel', onCancel)
  // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- same
  root.addEventListener('lostpointercapture', onLost)
  // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- same
  root.addEventListener('click', onClick, true)
  // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- same; non-passive so a long-pressed touch drag does not scroll the page
  root.addEventListener('touchmove', onTouchMove, { passive: false })
  // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- same
  root.addEventListener('contextmenu', onContextMenu)

  return () => {
    if (session !== null) abort()
    root.removeEventListener('pointerdown', onDown)
    root.removeEventListener('pointermove', onMove)
    root.removeEventListener('pointerup', onUp)
    root.removeEventListener('pointercancel', onCancel)
    root.removeEventListener('lostpointercapture', onLost)
    root.removeEventListener('click', onClick, true)
    root.removeEventListener('touchmove', onTouchMove)
    root.removeEventListener('contextmenu', onContextMenu)
    document.removeEventListener('keydown', onEscape, true)
  }
}

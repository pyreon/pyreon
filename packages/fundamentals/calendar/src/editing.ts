import { batch, runUntracked, signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import { toInstant } from '@pyreon/time/core'
import { dayLabel } from './labels'
import { formatTime } from '@pyreon/format'
import { businessMinutes } from './models'
import { applyEventChange, fitsWindows, moveTarget, nudgeTarget, reposition, resizeTarget } from './edit'
import type { EditScope, EventChange, Hit, Target } from './edit'
import type { CalState } from './state'
import type { EventOccurrence, PlainDate, PlainDateTime } from './types'

export type EditKind = 'move' | 'resize'

/** What is being edited now: by the pointer (a drag) or the keyboard (a grabbed event). `target` is where it would land. */
export interface Editing {
  key: string
  mode: EditKind
  by: 'pointer' | 'keyboard'
  target: Target
}

/** The session without its target: it changes when an edit begins, ends or changes mode, not on every move. */
export type Session = Omit<Editing, 'target'>

/** The editing state that lives next to the calendar state. */
export interface EditState {
  readonly overlay: Signal<ReadonlyMap<string, Target>>
  readonly editing: Signal<Session | null>
  readonly target: Signal<Target | null>
  readonly pending: Signal<ReadonlySet<string>>
}

export const createEditState = (): EditState => ({ overlay: signal(new Map()), editing: signal<Session | null>(null), target: signal<Target | null>(null), pending: signal(new Set()) })

/** The occurrences with the optimistic edits shown: only the edited occurrence changes, so only its days recompute. */
export function overlaid<Meta>(list: EventOccurrence<Meta>[], overlay: ReadonlyMap<string, Target>, zone: string): EventOccurrence<Meta>[] {
  if (overlay.size === 0) return list

  return list.map((o) => {
    const t = overlay.get(o.key)
    if (t === undefined) return o

    return { ...o, start: t.start, end: t.end, allDay: t.allDay, startMs: toInstant(t.start as PlainDate | PlainDateTime, zone), endMs: toInstant(t.end as PlainDate | PlainDateTime, zone) }
  })
}

export const snapOf = <Meta>(s: CalState<Meta>): number => s.options.snap ?? Math.max(1, Math.round(((s.options.slot?.hours ?? 0) * 60 + (s.options.slot?.minutes ?? 0)) || 30))
export const minOf = <Meta>(s: CalState<Meta>): number => s.options.minDuration ?? snapOf(s)

/** Can this occurrence be moved or resized? An event's own `editable` wins over the calendar's. */
export function canEdit<Meta>(s: CalState<Meta>, o: EventOccurrence<Meta>, kind: EditKind): boolean {
  const own = o.event.editable
  if (own === false) return false
  if (typeof own === 'object') return own[kind] ?? s.options.editable === true
  if (own === true) return true

  return s.options.editable === true && !runUntracked(() => s.edit.pending()).has(o.key)
}

/** Does the target satisfy `constrainTo`? */
export function allowed<Meta>(s: CalState<Meta>, target: Target): boolean {
  const rule = s.options.constrainTo
  if (rule === undefined) return true
  if (typeof rule === 'function') return rule({ start: target.start, end: target.end, allDay: target.allDay })

  return fitsWindows(target.start, target.end, (date) => businessMinutes(s, date))
}

const same = (a: Target, b: { start: string; end: string; allDay: boolean }): boolean => a.start === b.start && a.end === b.end && a.allDay === b.allDay

function whenText<Meta>(s: CalState<Meta>, t: Target): string {
  const locale = s.locale()
  const text = s.messages()
  if (t.allDay) return dayLabel(t.start.slice(0, 10) as PlainDate, locale)
  const from = formatTime(t.start, { locale, timeStyle: 'short' })
  const to = formatTime(t.end, { locale, timeStyle: 'short' })

  return `${dayLabel(t.start.slice(0, 10) as PlainDate, locale)}, ${text.range(from, to)}`
}

function setPending<Meta>(s: CalState<Meta>, key: string, on: boolean): void {
  const next = new Set(s.edit.pending.peek())
  if (on) next.add(key)
  else next.delete(key)
  s.edit.pending.set(next)
}

function setOverlay<Meta>(s: CalState<Meta>, key: string, target: Target | null): void {
  const next = new Map(s.edit.overlay.peek())
  if (target === null) next.delete(key)
  else next.set(key, target)
  s.edit.overlay.set(next)
}

async function askScope<Meta>(s: CalState<Meta>, change: EventChange<Meta>): Promise<EditScope | null> {
  if (change.occurrence === undefined || s.options.chooseScope === undefined) return 'this'
  try {
    return (await s.options.chooseScope(change)) ?? null
  } catch {
    return null
  }
}

/**
 * Ask the app to make a change. The occurrence is shown at the target at once (optimistic); a refusal (`false`), a throw or a
 * rejection puts it back and announces that. A recurring occurrence first asks `chooseScope` (`'this'` when there is none; `null`
 * cancels). Resolves to whether the app accepted the change. An occurrence waiting for the app cannot be edited again.
 */
export async function propose<Meta>(s: CalState<Meta>, key: string, target: Target, kind: EditKind): Promise<boolean> {
  const o = runUntracked(() => s.occurrences()).find((x) => x.key === key)
  const text = runUntracked(() => s.messages())
  if (o === undefined || s.edit.pending.peek().has(key)) return false
  if (same(target, o)) return false
  if (!allowed(s, target)) {
    s.announcement.set(text.failed(o.title))

    return false
  }
  const rep = reposition(o, target, s.zone())
  const change: EventChange<Meta> = { event: o.event, start: rep.start, end: rep.end, allDay: rep.allDay, ...(o.recurring ? { occurrence: o.occurrence } : {}) }
  if (o.recurring) {
    const scope = await askScope(s, change)
    if (scope === null) {
      s.announcement.set(text.cancelled(o.title))

      return false
    }
    change.scope = scope
  }
  batch(() => {
    setOverlay(s, key, target)
    setPending(s, key, true)
  })
  let ok = false
  try {
    ok = (await s.options.onEventChange?.(change)) !== false
  } catch {
    ok = false
  }
  batch(() => {
    setOverlay(s, key, null)
    setPending(s, key, false)
  })
  const done = kind === 'move' ? text.moved : text.resized
  s.announcement.set(ok ? done(o.title, whenText(s, target)) : text.failed(o.title))

  return ok
}

/** The occurrence a key names, as it is shown now. */
const find = <Meta>(s: CalState<Meta>, key: string): EventOccurrence<Meta> | undefined => runUntracked(() => s.occurrences()).find((o) => o.key === key)

export function beginEdit<Meta>(s: CalState<Meta>, key: string, mode: EditKind, by: 'pointer' | 'keyboard'): boolean {
  const o = find(s, key)
  if (o === undefined || !canEdit(s, o, mode) || s.edit.editing.peek() !== null) return false
  batch(() => {
    s.edit.target.set({ start: o.start, end: o.end, allDay: o.allDay })
    s.edit.editing.set({ key, mode, by })
  })
  if (by === 'keyboard') s.announcement.set(runUntracked(() => s.messages()).grabbed(o.title))

  return true
}

/** Show where the edit would land (keyboard: through the overlay, so the layout follows; the pointer moves the element itself). */
export function previewEdit<Meta>(s: CalState<Meta>, target: Target): void {
  const e = s.edit.editing.peek()
  if (e === null) return
  batch(() => {
    s.edit.target.set(target)
    if (e.by === 'keyboard') setOverlay(s, e.key, target)
  })
}

export function cancelEdit<Meta>(s: CalState<Meta>): void {
  const e = s.edit.editing.peek()
  if (e === null) return
  batch(() => {
    if (e.by === 'keyboard') setOverlay(s, e.key, null)
    s.edit.editing.set(null)
    s.edit.target.set(null)
  })
  const o = find(s, e.key)
  s.announcement.set(runUntracked(() => s.messages()).cancelled(o?.title ?? ''))
}

export async function dropEdit<Meta>(s: CalState<Meta>, target?: Target): Promise<boolean> {
  const e = s.edit.editing.peek()
  if (e === null) return false
  const where = target ?? s.edit.target.peek()
  batch(() => {
    if (e.by === 'keyboard') setOverlay(s, e.key, null)
    s.edit.editing.set(null)
    s.edit.target.set(null)
  })
  if (where === null) return false

  return propose(s, e.key, where, e.mode)
}

/** The keyboard way to edit: Enter or Space on an event grabs it, arrows move it, Shift with them resizes, Enter drops, Escape cancels. */
export function editKey<Meta>(s: CalState<Meta>, key: string, event: KeyboardEvent, grid: 'month' | 'time', rtl: boolean): boolean {
  const o = find(s, key)
  if (o === undefined) return false
  const editing = s.edit.editing.peek()
  if (editing === null || editing.key !== key) {
    if (event.key !== 'Enter' && event.key !== ' ') return false
    if (!canEdit(s, o, 'move')) return false

    return beginEdit(s, key, 'move', 'keyboard')
  }
  if (event.key === 'Escape') {
    cancelEdit(s)

    return true
  }
  if (event.key === 'Enter' || event.key === ' ') {
    void dropEdit(s)

    return true
  }
  const current = { ...o, ...s.edit.target.peek() } as EventOccurrence<Meta>
  const shift = event.shiftKey
  if (shift && !canEdit(s, o, 'resize')) return false
  const next = nudgeTarget(current, event.key, shift, grid, snapOf(s), minOf(s), rtl)
  if (next === null) return false
  s.edit.editing.set({ ...editing, mode: shift ? 'resize' : editing.mode })
  previewEdit(s, next)

  return true
}

export const editingMath = { moveTarget, resizeTarget, snapOf, minOf }
export type { Hit }
export { applyEventChange }

/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions -- a non-modal dialog that keeps its keyboard (Tab stays inside, Escape closes) on its own element: <dialog> is modal or top-layer, which would trap the page and block the calendar behind it */
import { For, onMount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { computed } from '@pyreon/reactivity'
import type { Calendar } from './calendar-types'
import { dayLabel, eventLabel } from './labels'
import { colorStyle } from './month-view'
import type { ViewProps } from './month-view'
import type { EventOccurrence, PlainDate } from './types'

/** What the popover is for: a day, the button that opened it, and where to put it (pixels inside the calendar). */
export interface PopoverState {
  date: PlainDate
  anchor: HTMLElement
  left: number
  top: number
}

const FOCUSABLE = 'button:not([disabled])'

/**
 * The "+N more" popover: a non-modal dialog listing every event of a day. Focus moves into it when it opens, Tab and Shift+Tab
 * stay inside, Escape closes it and gives the focus back to the "+N more" button (or the day when that button is gone), and a
 * press outside closes it without taking the focus. Choosing an event closes it and reports the click like any other.
 */
export function DayPopover<Meta>(props: { calendar: Calendar<Meta>; state: PopoverState; view: ViewProps<Meta>; onClose: () => void }): VNodeChild {
  const calendar = props.calendar
  const date = props.state.date
  const list = computed(() => calendar.dayOccurrences(date) as readonly EventOccurrence<Meta>[])
  let box: HTMLElement | null = null

  const close = (restore: boolean): void => {
    const anchor = props.state.anchor
    props.onClose()
    if (!restore) return
    queueMicrotask(() => {
      // pyreon-lint-disable-next-line pyreon/no-dom-in-setup, pyreon/no-window-in-ssr -- runs only after a click or a key, never during setup
      const target = anchor.isConnected ? anchor : document.querySelector<HTMLElement>(`[data-date="${date}"]`)
      target?.focus()
    })
  }

  onMount(() => {
    const el = box
    if (el === null) return undefined
    ;(el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus()
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !el.contains(event.target) && !props.state.anchor.contains(event.target)) close(false)
    }
    // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- a press outside closes the popover; removed in the cleanup below
    document.addEventListener('pointerdown', outside, true)

    return () => document.removeEventListener('pointerdown', outside, true)
  })

  return (
    <div
      class="pcal-popover"
      role="dialog"
      aria-modal="false"
      aria-label={() => dayLabel(date, calendar.locale())}
      tabIndex={-1}
      style={`left:${props.state.left}px;top:${props.state.top}px`}
      ref={(el: HTMLElement | null) => {
        box = el
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          close(true)

          return
        }
        if (e.key !== 'Tab' || box === null) return
        const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)]
        const first = items[0]
        const last = items.at(-1)
        if (first === undefined || last === undefined) return
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }}
    >
      <div class="pcal-popover-head">
        <h3 class="pcal-popover-title">{() => dayLabel(date, calendar.locale())}</h3>
        <button type="button" class="pcal-btn pcal-popover-close" aria-label={() => calendar.messages().close} onClick={() => close(true)}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <ul class="pcal-popover-list">
        <For each={() => list()} by={(o: EventOccurrence<Meta>) => o.key}>
          {(o: EventOccurrence<Meta>) => (
            <li>
              <button
                type="button"
                class="pcal-event pcal-popover-event"
                style={colorStyle(o.event.color)}
                data-key={o.key}
                aria-label={() => eventLabel(o as EventOccurrence, calendar.locale(), calendar.messages())}
                onClick={() => {
                  close(false)
                  calendar.eventClick(o.key)
                }}
              >
                {props.view.renderEvent === undefined ? <span class="pcal-event-title">{o.title}</span> : props.view.renderEvent({ occurrence: o, label: eventLabel(o as EventOccurrence, calendar.locale(), calendar.messages()), continuesBefore: false, continuesAfter: false })}
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}

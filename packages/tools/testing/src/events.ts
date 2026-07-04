/**
 * `fireEvent` — dispatch DOM events the way Pyreon's event system consumes
 * them. THE load-bearing detail: Pyreon delegates ~all common events (one
 * listener per event on the mount container; per-element handlers stored as
 * `__ev_*` expandos and invoked by a root walk). A delegated handler only
 * fires if the event BUBBLES to the delegation root — so every fireEvent here
 * dispatches with `bubbles: true`. A non-bubbling synthetic event would leave
 * the handler silently un-invoked (bisect-locked in the browser tests).
 *
 * Mirrors `@testing-library/dom`'s `fireEvent`: `fireEvent(el, event)` for a
 * prebuilt event, or `fireEvent.click(el, init?)` / `.input(el, { target: {
 * value } })` convenience methods.
 */

type EventCtor = new (type: string, init?: EventInit) => Event

interface EventTypeSpec {
  ctor: EventCtor
  defaults: EventInit
}

// Bubbling + cancelable defaults matched to how the delegation root reads the
// event. Types not listed fall back to a bubbling generic `Event`.
const EVENT_TYPES: Record<string, EventTypeSpec> = {
  click: { ctor: MouseEvent, defaults: { bubbles: true, cancelable: true } },
  dblClick: { ctor: MouseEvent, defaults: { bubbles: true, cancelable: true } },
  mouseDown: { ctor: MouseEvent, defaults: { bubbles: true, cancelable: true } },
  mouseUp: { ctor: MouseEvent, defaults: { bubbles: true, cancelable: true } },
  mouseOver: { ctor: MouseEvent, defaults: { bubbles: true, cancelable: true } },
  mouseOut: { ctor: MouseEvent, defaults: { bubbles: true, cancelable: true } },
  mouseMove: { ctor: MouseEvent, defaults: { bubbles: true, cancelable: true } },
  contextMenu: { ctor: MouseEvent, defaults: { bubbles: true, cancelable: true } },
  pointerDown: { ctor: PointerEvent, defaults: { bubbles: true, cancelable: true } },
  pointerUp: { ctor: PointerEvent, defaults: { bubbles: true, cancelable: true } },
  pointerMove: { ctor: PointerEvent, defaults: { bubbles: true, cancelable: true } },
  keyDown: { ctor: KeyboardEvent, defaults: { bubbles: true, cancelable: true } },
  keyUp: { ctor: KeyboardEvent, defaults: { bubbles: true, cancelable: true } },
  input: { ctor: InputEvent, defaults: { bubbles: true, cancelable: false } },
  change: { ctor: Event, defaults: { bubbles: true, cancelable: false } },
  submit: { ctor: Event, defaults: { bubbles: true, cancelable: true } },
  focusIn: { ctor: FocusEvent, defaults: { bubbles: true } },
  focusOut: { ctor: FocusEvent, defaults: { bubbles: true } },
}

/** camelCase method name → DOM event `type` string. */
function domEventName(method: string): string {
  const lower = method.charAt(0).toLowerCase() + method.slice(1)
  const map: Record<string, string> = {
    dblClick: 'dblclick',
    contextMenu: 'contextmenu',
    mouseDown: 'mousedown',
    mouseUp: 'mouseup',
    mouseOver: 'mouseover',
    mouseOut: 'mouseout',
    mouseMove: 'mousemove',
    pointerDown: 'pointerdown',
    pointerUp: 'pointerup',
    pointerMove: 'pointermove',
    keyDown: 'keydown',
    keyUp: 'keyup',
    focusIn: 'focusin',
    focusOut: 'focusout',
  }
  return map[method] ?? lower
}

interface FireEventInit extends EventInit {
  /** Set properties on the target before dispatch (e.g. `{ value }` for input). */
  target?: Record<string, unknown>
  [key: string]: unknown
}

type FireEventFn = {
  (element: Element, event: Event): boolean
} & Record<string, (element: Element, init?: FireEventInit) => boolean>

function dispatch(element: Element, event: Event): boolean {
  return element.dispatchEvent(event)
}

export const fireEvent = ((element: Element, event: Event): boolean =>
  dispatch(element, event)) as FireEventFn

for (const method of Object.keys(EVENT_TYPES)) {
  const spec = EVENT_TYPES[method]!
  const type = domEventName(method)
  fireEvent[method] = (element: Element, init: FireEventInit = {}): boolean => {
    // Apply `target` props (input value, checked, …) BEFORE dispatch so
    // handlers reading el.value see the new value.
    if (init.target) {
      for (const [k, v] of Object.entries(init.target)) {
        ;(element as unknown as Record<string, unknown>)[k] = v
      }
    }
    const { target: _t, ...eventInit } = init
    const event = new spec.ctor(type, { ...spec.defaults, ...eventInit })
    return dispatch(element, event)
  }
}

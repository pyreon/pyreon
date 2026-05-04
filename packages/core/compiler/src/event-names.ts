/**
 * React-style → DOM event-name remap.
 *
 * The compiler translates JSX event handler attributes (`onClick`,
 * `onMouseEnter`, ...) to DOM event names by stripping the `on` prefix
 * and lowercasing. That rule covers MOST React event-name conventions
 * because the underlying DOM event name happens to be the lowercased
 * multi-word form (e.g. `onKeyDown` → `keydown`, `onMouseEnter` →
 * `mouseenter`, `onPointerLeave` → `pointerleave`,
 * `onAnimationStart` → `animationstart`, `onContextMenu` → `contextmenu`).
 *
 * **The exceptions** — where lowercasing produces the WRONG DOM event
 * name — are listed in `REACT_EVENT_REMAP` below. Each entry maps the
 * lowercased React form to the actual DOM event name.
 *
 * Today there is exactly ONE remap: `doubleclick → dblclick`. React
 * inherits this mismatch from the DOM spec — `dblclick` is the canonical
 * event name (RFC at `https://dom.spec.whatwg.org/#interface-mouseevent`),
 * while React's component-prop convention is the `onDoubleClick` shape.
 *
 * **Audit completeness.** The full React event-prop list from
 * `https://react.dev/reference/react-dom/components/common` was checked
 * against canonical DOM event names. Every multi-word event other than
 * `onDoubleClick` lowercases correctly:
 *   - Pointer family: `onPointerDown` → `pointerdown`, `onGotPointerCapture` → `gotpointercapture`, …
 *   - Mouse family: `onMouseEnter` → `mouseenter`, `onMouseLeave` → `mouseleave`, …
 *   - Drag family: `onDragStart` → `dragstart`, `onDragEnd` → `dragend`, …
 *   - Touch family: `onTouchStart` → `touchstart`, `onTouchEnd` → `touchend`, …
 *   - Composition family: `onCompositionEnd` → `compositionend`, …
 *   - Animation/transition: `onAnimationStart` → `animationstart`, `onTransitionEnd` → `transitionend`, …
 *   - Media family: `onCanPlayThrough` → `canplaythrough`, `onLoadedData` → `loadeddata`, `onTimeUpdate` → `timeupdate`, `onVolumeChange` → `volumechange`, …
 *   - Form family: `onContextMenu` → `contextmenu`, `onBeforeInput` → `beforeinput`, …
 *
 * If a future React release adds a new event-prop with a non-trivial
 * mismatch, append the entry here. Both compiler backends (JS and Rust)
 * read the same shape — the Rust port lives in `native/src/lib.rs` next
 * to `emit_event_listener`. Keep them in sync.
 *
 * **Testing.** `packages/core/compiler/src/tests/runtime/events.test.ts`
 * exercises this table end-to-end via a real-Chromium harness:
 *   - `onDoubleClick fires (multi-word + delegated)` — locks in the remap.
 *   - `onContextMenu fires (multi-word, lowercases to contextmenu)` —
 *     locks in the no-remap default for an adjacent multi-word event.
 *   - `event-name-remap-table sanity` — asserts that every entry in
 *     `REACT_EVENT_REMAP` has a corresponding runtime test.
 */
export const REACT_EVENT_REMAP: Readonly<Record<string, string>> = Object.freeze({
  doubleclick: 'dblclick',
})

/**
 * Translate a React-style event prop name (`onDoubleClick`) to the
 * canonical DOM event name (`dblclick`). Returns null for non-event
 * attribute names (anything not starting with `on` or shorter than 3
 * characters — single-letter `on*` props don't correspond to DOM events).
 *
 * The compiler uses the returned name in two emission shapes:
 *   - Delegated events (in `DELEGATED_EVENTS`): `el.__ev_${eventName} = handler`
 *   - Direct listeners: `el.addEventListener("${eventName}", handler)`
 */
export function reactEventToDom(attrName: string): string | null {
  if (attrName.length <= 2 || !attrName.startsWith('on')) return null
  const lower = attrName.slice(2).toLowerCase()
  return REACT_EVENT_REMAP[lower] ?? lower
}

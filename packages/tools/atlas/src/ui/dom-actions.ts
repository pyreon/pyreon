/**
 * Log DOM interactions inside the preview to the Actions panel.
 *
 * The declared-handler path (`catalog-module` wraps every `on[A-Z]` prop the
 * scan found) is precise but only as good as the scan: a rocketstyle component
 * declares its props as dimensions, not as a typed `onClick`, so a whole
 * rocketstyle library — `@pyreon/ui-components` included — produced an Actions
 * panel that never logged anything, however hard you clicked.
 *
 * This is the half that needs no declaration: the preview root listens (in the
 * CAPTURE phase, so a component calling `stopPropagation` cannot hide an event
 * from it) and logs what happened to which element. Both halves run; a
 * declared handler still logs its own name and argument.
 */

/** The events worth logging. Pointer MOVES are not — they would flood the ring. */
export const DOM_ACTION_EVENTS = [
  'click',
  'dblclick',
  'input',
  'change',
  'submit',
  'keydown',
  'focusin',
  'focusout',
] as const

/** What a reader means by "the element I clicked". */
const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role]'

/** `focusin`/`focusout` are what bubble; a reader thinks in focus/blur. */
const LABEL: Record<string, string> = { focusin: 'focus', focusout: 'blur' }

/**
 * A short, human description of an element — `<button> "Save"`,
 * `<input type=email name=email>`. Enough to tell WHICH element an event hit
 * without a DOM inspector.
 */
export function describeElement(el: Element | null): string {
  if (!el) return ''
  const tag = el.tagName.toLowerCase()
  const bits: string[] = []
  for (const attr of ['role', 'type', 'name', 'aria-label', 'data-testid']) {
    const v = el.getAttribute(attr)
    if (v) bits.push(`${attr}=${v.length > 24 ? `${v.slice(0, 24)}…` : v}`)
  }
  // An Element's `textContent` is never null (only a document's is).
  const text = (el.textContent as string).trim().replace(/\s+/g, ' ')
  const label = text ? ` "${text.length > 32 ? `${text.slice(0, 32)}…` : text}"` : ''
  return `<${tag}${bits.length ? ` ${bits.join(' ')}` : ''}>${label}`
}

/** The detail string for one event — the target, plus what the event carries. */
export function describeEvent(e: Event, root?: Element): string {
  // The CONTROL, not the span inside it: a click on a button's label hits the
  // label's `<span>`, and "click <span>" names the wrong thing. Bounded by the
  // preview root — an ancestor OUTSIDE it is workbench chrome, not the
  // component.
  const hit = e.target instanceof Element ? e.target : null
  const control = hit?.closest(INTERACTIVE)
  const target = control && (!root || root.contains(control)) ? control : hit
  let extra = ''
  if (e.type === 'keydown') extra = ` key=${(e as KeyboardEvent).key}`
  else if ((e.type === 'input' || e.type === 'change') && target) {
    const t = target as HTMLInputElement
    const value = t.type === 'checkbox' || t.type === 'radio' ? String(t.checked) : String(t.value)
    extra = ` value=${value.length > 32 ? `${value.slice(0, 32)}…` : value}`
  }
  return `${describeElement(target)}${extra}`
}

/**
 * Listen on `root` and log each interaction. Returns the disposer.
 *
 * Raw listeners on purpose: this runs from a `ref`, outside any component
 * setup, and owns its own teardown (the ref's detach calls the disposer).
 */
export function captureDomActions(
  root: HTMLElement,
  log: (name: string, detail: string) => void,
): () => void {
  const handler = (e: Event) => log(LABEL[e.type] ?? e.type, describeEvent(e, root))
  for (const type of DOM_ACTION_EVENTS) root.addEventListener(type, handler, true)
  return () => {
    for (const type of DOM_ACTION_EVENTS) root.removeEventListener(type, handler, true)
  }
}

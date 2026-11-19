// pyreon-lint-disable-file pyreon/no-window-in-ssr -- every function here is called from the dialog's onMount, which only runs in a browser
/**
 * The DOM behaviour of the palette dialog, apart from its markup: the modal (native `<dialog>.showModal()`, which makes
 * everything behind it inert and puts it in the top layer; a fallback for a browser without it), scroll locked without a
 * layout shift, and Tab kept inside.
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let locks = 0
let restoreScroll: (() => void) | null = null

function lock(): void {
  const html = document.documentElement
  const before = { overflow: html.style.overflow, padding: html.style.paddingRight, paddingLeft: html.style.paddingLeft }
  const style = getComputedStyle(html)
  const bar = window.innerWidth - html.clientWidth
  const rtl = style.direction === 'rtl'
  html.style.overflow = 'hidden'
  // The scrollbar leaves with the overflow: its width is added as padding on its side, so the page does not shift.
  if (bar > 0) {
    if (rtl) html.style.paddingLeft = `${Number.parseFloat(style.paddingLeft) + bar}px`
    else html.style.paddingRight = `${Number.parseFloat(style.paddingRight) + bar}px`
  }
  restoreScroll = () => {
    html.style.overflow = before.overflow
    html.style.paddingRight = before.padding
    html.style.paddingLeft = before.paddingLeft
  }
}

/** Lock the page scroll without a layout shift. Counted: it unlocks when the last lock is released. Returns the release. */
export function lockScroll(): () => void {
  if (locks === 0) lock()
  locks++
  let released = false

  return () => {
    if (released) return
    released = true
    locks--
    if (locks === 0) {
      restoreScroll?.()
      restoreScroll = null
    }
  }
}

/** The focusable elements inside `root`, in DOM order, that can take focus now. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden && el.getClientRects().length > 0)
}

/** Keep Tab and Shift+Tab inside `root`: from the last element to the first and back. Returns `true` when it moved focus. */
export function trapTab(root: HTMLElement, event: KeyboardEvent): boolean {
  if (event.key !== 'Tab') return false
  const items = focusables(root)
  if (items.length === 0) {
    event.preventDefault()

    return true
  }
  const first = items[0] as HTMLElement
  const last = items.at(-1) as HTMLElement
  const active = document.activeElement
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault()
    last.focus()

    return true
  }
  if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault()
    first.focus()

    return true
  }

  return false
}

/**
 * Show `dialog` as a modal. Native `showModal()` makes the rest of the page inert (a modal dialog already open stays below,
 * inert, and is back when this one closes). Without it, the other children of `<body>` are made inert (the `inert` attribute,
 * `aria-hidden` where that is unsupported) and restored on close. Returns the close function.
 */
export function showModal(dialog: HTMLDialogElement): () => void {
  if (typeof dialog.showModal === 'function') {
    dialog.showModal()

    return () => {
      if (dialog.open) dialog.close()
    }
  }
  dialog.setAttribute('open', '')
  dialog.setAttribute('aria-modal', 'true')
  const hidden: { el: Element; inert: boolean; ariaHidden: string | null }[] = []
  for (const el of document.body.children) {
    if (el === dialog || el.contains(dialog)) continue
    hidden.push({ el, inert: el.hasAttribute('inert'), ariaHidden: el.getAttribute('aria-hidden') })
    el.setAttribute('inert', '')
    el.setAttribute('aria-hidden', 'true')
  }

  return () => {
    dialog.removeAttribute('open')
    for (const { el, inert, ariaHidden } of hidden) {
      if (!inert) el.removeAttribute('inert')
      if (ariaHidden === null) el.removeAttribute('aria-hidden')
      else el.setAttribute('aria-hidden', ariaHidden)
    }
  }
}

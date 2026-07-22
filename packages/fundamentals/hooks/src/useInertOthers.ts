import { onMount } from '@pyreon/core'
import { isServer, watch } from '@pyreon/reactivity'

export interface UseInertOthersOptions {
  /**
   * Whether the hook is armed. Pass a getter (`() => isOpen()`) to arm/disarm
   * reactively. Defaults to `true` — the element's own lifecycle then gates
   * the hook: application follows `getEl()` (null = nothing inert), so a
   * dialog that renders only while open needs no explicit `active` at all.
   */
  active?: boolean | (() => boolean)
}

// ---------------------------------------------------------------------------
// Shared refcount state.
//
// Two stacked modals both inert the page behind them, and the INNER modal's
// subtree overlaps the outer's target set (the outer modal element itself is
// one of the inner's "others"). A per-element counter (Memory-Leak-Class D
// refcount shape) makes release order-independent: the inner's cleanup
// decrements but only the LAST holder actually restores the attribute.
//
// `previouslyInert` snapshots elements that were ALREADY `inert` before the
// first holder touched them — those stay inert after every holder releases
// (we restore EXACTLY the prior state, never blanket-remove). Both maps hold
// entries only between acquire and release; instance cleanup on unmount
// guarantees release, so the maps are bounded by the currently-active
// overlays (no unbounded Class-C growth).
// ---------------------------------------------------------------------------

const inertCounts = new Map<HTMLElement, number>()
const previouslyInert = new Set<HTMLElement>()

/** Tags that are never rendered content — pointless (and noisy) to inert. */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META'])

/**
 * Whether a sibling subtree must be left alone: non-rendered utility tags,
 * and live regions — `inert` removes a subtree from the accessibility tree
 * entirely, so inert-ing an `[aria-live]` announcer (e.g. `@pyreon/a11y`'s
 * `announce()` region on `document.body`) would silence screen-reader
 * announcements for as long as the overlay is open.
 */
function shouldSkip(el: Element): boolean {
  return (
    SKIP_TAGS.has(el.tagName) ||
    el.hasAttribute('aria-live') ||
    el.hasAttribute('data-live-announcer')
  )
}

/**
 * Every element sibling OUTSIDE the ancestor chain of `el`, walking up from
 * `el` to `document.body` (inclusive of body's children). Inert-ing exactly
 * these subtrees makes everything except `el` (and its ancestors) inert.
 */
function collectOthers(el: HTMLElement): HTMLElement[] {
  const others: HTMLElement[] = []
  const body = el.ownerDocument.body
  let node: HTMLElement = el
  while (node !== body) {
    const parent = node.parentElement
    if (!parent) break
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node) continue
      if (!(sibling instanceof HTMLElement)) continue
      if (shouldSkip(sibling)) continue
      others.push(sibling)
    }
    node = parent
  }
  return others
}

/** Acquire a hold on each target; first holder snapshots + sets `inert`. */
function acquireInert(targets: HTMLElement[]): void {
  for (const t of targets) {
    const count = inertCounts.get(t) ?? 0
    if (count === 0) {
      if (t.hasAttribute('inert')) previouslyInert.add(t)
      else t.setAttribute('inert', '')
    }
    inertCounts.set(t, count + 1)
  }
}

/** Release a hold; the LAST holder restores the exact prior state. */
function releaseInert(targets: HTMLElement[]): void {
  for (const t of targets) {
    const count = inertCounts.get(t) ?? 0
    /* v8 ignore next — double-release guard; release paths are idempotent
       upstream (watch cleanup runs once per application). */
    if (count === 0) continue
    if (count === 1) {
      inertCounts.delete(t)
      if (previouslyInert.has(t)) previouslyInert.delete(t)
      else t.removeAttribute('inert')
    } else {
      inertCounts.set(t, count - 1)
    }
  }
}

/**
 * Apply the native `inert` attribute to everything OUTSIDE the element
 * returned by `getEl()` — each ancestor level's sibling subtrees, from the
 * element up to `document.body`. The modal companion `aria-modal="true"` only
 * TELLS assistive tech the background is inert; this hook makes it TRUE: the
 * background becomes unfocusable, unclickable, and hidden from the
 * accessibility tree, for screen readers AND sighted keyboard users.
 *
 * - **Exact restore**: cleanup restores precisely the prior state — an
 *   element that was already `inert` before the hook touched it STAYS inert.
 * - **Nesting-safe**: stacked overlays share a per-element refcount, so the
 *   inner overlay's cleanup never un-inerts what the outer still needs.
 * - **Reactive**: the application follows `getEl()` — pass a signal-backed
 *   getter (`() => dialogRef()`) and the hook applies when the element
 *   mounts, releases when it unmounts (ref → null), and re-applies if the
 *   element identity changes. `active` additionally arms/disarms it without
 *   unmounting.
 * - **Skipped subtrees**: `script`/`style`/`template`/`link`/`meta` and live
 *   regions (`[aria-live]`, `[data-live-announcer]`) are left alone — a live
 *   announcer that gets inert-ed would silence screen-reader announcements
 *   while the overlay is open.
 *
 * Siblings that mount AFTER application (a toast portaled to `document.body`
 * while the modal is open) are NOT retroactively inert-ed — that's usually
 * what you want (the toast should announce), but re-open or toggle `active`
 * to re-apply if needed.
 *
 * SSR-safe (no-op on the server), self-cleaning on unmount.
 *
 * @example
 * ```tsx
 * const dialogRef = signal<HTMLElement | null>(null)
 *
 * // The dialog renders only while open, so the ref IS the lifecycle:
 * useInertOthers(() => dialogRef())
 * useFocusTrap(() => dialogRef(), { active: () => isOpen() })
 * ```
 */
export function useInertOthers(
  getEl: () => HTMLElement | null,
  options?: UseInertOthersOptions | boolean | (() => boolean),
): void {
  /* v8 ignore next — SSR/isServer guard; tests run with happy-dom */
  if (isServer) return

  // Normalize the overloaded 2nd arg (same shape as useFocusTrap): a
  // boolean / function is the `active` shorthand, an object the options bag.
  let opts: UseInertOthersOptions
  if (typeof options === 'object' && options !== null) {
    opts = options
  } else if (options === undefined) {
    opts = {}
  } else {
    opts = { active: options }
  }

  const rawActive = opts.active
  const isActive: () => boolean =
    rawActive === undefined
      ? () => true
      : typeof rawActive === 'function'
        ? rawActive
        : () => rawActive

  onMount(() => {
    // The watch source combines arming + element identity, so flipping
    // `active` OR the element mounting/unmounting (signal-backed ref) both
    // re-run the application. The callback returns its release as the watch
    // cleanup — `watch` runs it before the next application and on stop.
    const stop = watch(
      () => (isActive() ? getEl() : null),
      (el) => {
        if (!el) return
        const targets = collectOthers(el)
        acquireInert(targets)
        return () => releaseInert(targets)
      },
      { immediate: true },
    )

    return stop
  })
}

export default useInertOthers

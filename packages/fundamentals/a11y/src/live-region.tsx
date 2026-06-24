import { h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import type { A11yPoliteness } from './announce'
import { VisuallyHidden } from './visually-hidden'

/**
 * Politeness of a `<LiveRegion>`. Adds `'off'` to the announce politeness set
 * (`'polite'` / `'assertive'`) — `'off'` keeps the region in the DOM but
 * silences announcements, so you can toggle a region on and off reactively
 * (`politeness={() => muted() ? 'off' : 'polite'}`) without unmounting it.
 */
export type LiveRegionPoliteness = A11yPoliteness | 'off'

export interface LiveRegionProps {
  /**
   * Politeness (default `'polite'`). `'polite'` queues the announcement for
   * when the user is idle (status text, result counts, "saved"); `'assertive'`
   * interrupts immediately (errors, time-critical alerts — use sparingly);
   * `'off'` silences the region without removing it.
   */
  politeness?: LiveRegionPoliteness
  /**
   * `aria-atomic` (default `true`) — when the content changes, announce the
   * WHOLE region, not just the changed node. Set `false` with `role="log"` for
   * append-only regions where only the newest entry should be read.
   */
  atomic?: boolean
  /**
   * ARIA role. Defaults to `'status'` for `'polite'` and `'alert'` for
   * `'assertive'` (omitted for `'off'`). Pass `'log'` for an append-only feed.
   */
  role?: 'status' | 'alert' | 'log'
  /**
   * Render the region visibly instead of screen-reader-only (default `false`).
   * Use `true` when the status text is ALSO meant to be seen (a visible
   * "Saving…" line that doubles as the live region).
   */
  visible?: boolean
  children?: VNodeChild
  /** Any other props (id, class, aria-*, ...) are forwarded to the element. */
  [key: string]: unknown
}

/**
 * A declarative `aria-live` region — the persistent, reactive complement to
 * the imperative `announce()`.
 *
 * Place it once in your tree and drive its children with a signal; whenever
 * the content changes, screen readers announce the new value automatically
 * (the browser's live-region machinery observes the DOM mutation — no
 * `announce()` call, no effect to wire). Use it for status that lives
 * somewhere specific in the layout: a form's validation summary, a "Saving…"
 * → "Saved" indicator, an async result count, a connection-status banner.
 *
 * `announce()` is fire-and-forget and global (one shared region on
 * `document.body`); `<LiveRegion>` is something you OWN and position — and,
 * because it renders on the server too, the region exists at hydration so the
 * very first reactive update is announced.
 *
 * SSR-safe: it renders a plain element with the ARIA attributes (no DOM
 * access at setup), screen-reader-only by default.
 *
 * @example
 * ```tsx
 * import { LiveRegion } from '@pyreon/a11y'
 *
 * // Reactive status — announced on every change, zero wiring:
 * <LiveRegion>{() => status()}</LiveRegion>
 *
 * // Visible "Saving…" line that also announces:
 * <LiveRegion visible>{() => saveState()}</LiveRegion>
 *
 * // Errors interrupt:
 * <LiveRegion politeness="assertive">{() => error()}</LiveRegion>
 * ```
 */
export function LiveRegion(props: LiveRegionProps): VNodeChild {
  const {
    politeness = 'polite',
    atomic = true,
    role,
    visible = false,
    children,
    ...rest
  } = props as LiveRegionProps

  const resolvedRole =
    role ??
    (politeness === 'off' ? undefined : politeness === 'assertive' ? 'alert' : 'status')

  const ariaProps: Record<string, unknown> = {
    ...rest,
    'aria-live': politeness,
    'aria-atomic': atomic ? 'true' : 'false',
  }
  if (resolvedRole !== undefined) ariaProps.role = resolvedRole

  // Visible: a plain element carrying the live-region semantics.
  if (visible) return h('div', ariaProps, children)
  // Default: screen-reader-only — reuse VisuallyHidden's canonical clipping
  // (kept in the a11y tree, unlike display:none) and forward the ARIA props.
  return h(VisuallyHidden, { as: 'div', ...ariaProps }, children)
}

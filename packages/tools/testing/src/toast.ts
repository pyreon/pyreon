/**
 * `@pyreon/testing/toast` — test helpers for `@pyreon/toast`.
 *
 * Toasts live in a module-level store (`toast()` works headless), and
 * `<Toaster>` renders them into a per-instance host appended to
 * `document.body` — OUTSIDE your render container. These helpers assert
 * against the STORE (robust: no portal traversal, works with or without a
 * mounted `<Toaster>`):
 *
 *   expectToast(/saved/)            — assert a matching toast exists NOW
 *   await findToast(/saved/)        — wait for one to appear
 *   clearToasts()                   — reset the store between tests
 *
 * For DOM-level assertions (the rendered toast element), the normal queries
 * already work: `render()` binds queries to `document.body`, which contains
 * the Toaster host — `screen.getByRole('status')` / `getByText(...)`.
 *
 * MATCHING NOTE: `message`/`description` can be a VNode; matchers compare
 * STRING messages only (a VNode message never matches a string/RegExp —
 * query the rendered DOM for those).
 *
 * Requires the optional peer `@pyreon/toast`.
 */
import type { Toast, ToastType } from '@pyreon/toast'
import { _reset, _toasts } from '@pyreon/toast'
import { waitFor } from '@testing-library/dom'

/** A matcher for a toast's `message` (or `description`): substring or RegExp. */
export type ToastMatch = string | RegExp

export interface ToastQueryOptions {
  /** Restrict the match to one toast type (`'success'`, `'error'`, …). */
  type?: ToastType
  /** Include soft-dismissed (`state: 'exiting'`) toasts. Default `false`. */
  includeExiting?: boolean
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function matches(toast: Toast, match: ToastMatch | undefined, options: ToastQueryOptions): boolean {
  if (options.type !== undefined && toast.type !== options.type) return false
  if (!(options.includeExiting ?? false) && toast.state === 'exiting') return false
  if (match === undefined) return true
  const haystacks = [textOf(toast.message), textOf(toast.description)].filter(
    (t): t is string => t !== null,
  )
  return haystacks.some((text) => (typeof match === 'string' ? text.includes(match) : match.test(text)))
}

/** All live toasts (excluding `exiting` ones unless opted in) — a snapshot of the store. */
export function getToasts(options: ToastQueryOptions = {}): Toast[] {
  return _toasts().filter((t) => matches(t, undefined, options))
}

/**
 * Assert a toast matching `match` exists RIGHT NOW; returns it (first match,
 * oldest first). Throws a `[Pyreon]`-prefixed error listing the current
 * toasts when none matches. Synchronous — for toasts produced by async flows
 * use `await findToast(...)`.
 *
 * @example
 *   fireEvent.click(screen.getByRole('button', { name: 'Save' }))
 *   const t = expectToast(/saved/i, { type: 'success' })
 */
export function expectToast(match?: ToastMatch, options: ToastQueryOptions = {}): Toast {
  const found = _toasts().find((t) => matches(t, match, options))
  if (found === undefined) {
    const current = _toasts()
      .map((t) => `[${t.type}${t.state === 'exiting' ? ', exiting' : ''}] ${textOf(t.message) ?? '<VNode message>'}`)
      .join('; ')
    throw new Error(
      `[Pyreon] expectToast: no toast matching ${match === undefined ? '<any>' : String(match)}${options.type ? ` of type "${options.type}"` : ''} — current toasts: ${current || '(none)'}. For async flows use \`await findToast(...)\`; VNode messages need DOM queries.`,
    )
  }
  return found
}

/**
 * Wait (Testing-Library `waitFor` semantics) until a toast matching `match`
 * appears; resolves with it. Use for toasts raised by async work
 * (`toast.promise`, a mutation's `onSuccess`, …).
 *
 * @example
 *   await findToast(/profile updated/i)
 */
export function findToast(match?: ToastMatch, options: ToastQueryOptions = {}): Promise<Toast> {
  return waitFor(() => expectToast(match, options))
}

/**
 * Hard-reset the toast store: clears every toast (+ its timers) and the id
 * counter. Call between tests (an `afterEach`) so auto-dismiss timers and
 * leftover toasts never bleed across tests.
 */
export function clearToasts(): void {
  _reset()
}

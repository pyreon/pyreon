import type { Todo, TodoApp } from './types'

/**
 * A real-app scenario. `setup()` runs UNTIMED (mount + seed to a known state).
 * `act()` is the single timed region. `verify()` asserts the committed DOM so a
 * framework that "wins" by not committing throws instead of passing.
 */
export interface Scenario {
  name: string
  description: string
  setup: (app: TodoApp) => void
  act: (app: TodoApp) => void
  verify: (container: HTMLElement) => void
}

function seedTodos(count: number, done: boolean): Todo[] {
  const out: Todo[] = []
  for (let i = 0; i < count; i++) out.push({ id: i + 1, text: `Todo item ${i + 1}`, done })
  return out
}

function expectRows(container: HTMLElement, n: number): void {
  const got = container.querySelectorAll('.todos li').length
  if (got !== n) throw new Error(`expected ${n} rows, got ${got}`)
}

function expectCompleted(container: HTMLElement, n: number): void {
  const got = container.querySelectorAll('.todos li.completed').length
  if (got !== n) throw new Error(`expected ${n} completed rows, got ${got}`)
  // The class alone is half the toggle: the checkbox is the other DOM write.
  const checked = container.querySelectorAll<HTMLInputElement>('.todos li input').length
  let on = 0
  for (const el of container.querySelectorAll<HTMLInputElement>('.todos li input')) if (el.checked) on++
  if (on !== n || checked !== n) throw new Error(`expected ${n} checked boxes, got ${on}/${checked}`)
}

/** Rows present AND carrying the text each was added with (a no-op or
 *  wrong-content render fails, not just a wrong count). */
function expectAddedRows(container: HTMLElement, n: number): void {
  expectRows(container, n)
  const spans = container.querySelectorAll('.todos li span')
  for (let i = 0; i < n; i++) {
    const want = `Todo item ${i + 1}`
    if (spans[i]?.textContent !== want) throw new Error(`row ${i}: expected "${want}", got "${spans[i]?.textContent}"`)
  }
}

/**
 * The shipped scenarios. Each is a single sync timed region committed through
 * the framework's `runCommitted` (Pyreon: direct; React: `flushSync`), so they
 * isolate render cost cleanly. Sizes differ per scenario:
 *
 * - `add-100` — 100 *rapid-succession* appends in one synchronous task. Each
 *   framework does what it natively does with that input: Pyreon's un-batched
 *   `rows.set` runs 100 incremental keyed-`<For>` reconciles (and copies the
 *   array 100×); React batches the 100 `setState`s into ONE render. So this
 *   cell compares a batching and a non-batching default, not per-insert cost —
 *   a Pyreon app wrapping the loop in `batch()` would do one reconcile.
 * - `toggle-1000` / `clear-1000` — bulk operations at 1000 so Pyreon's
 *   fine-grained path stays measurably above the `performance.now()` floor
 *   (measured when the page was NOT cross-origin isolated — at 100 items it
 *   read 0µs under the 100µs clamp; the page is isolated now, 5µs clock).
 *   Pyreon flips 1000 per-row `done` signals (1000 in-place checkbox/class
 *   patches, no list reconciliation); React re-renders the whole 1000-row list
 *   and reconciles via VDOM diff.
 *
 * Scenarios needing a commit BETWEEN sub-actions (filter-cycle: React
 * auto-batches sync `setFilter` calls) and per-framework plumbing (drag-reorder
 * dnd, cold-start TTI) are the documented follow-up (see README).
 */
export const SCENARIOS: Scenario[] = [
  {
    name: 'add-100',
    description: 'append 100 todos to an empty list in rapid succession',
    setup: (app) => app.seed([]),
    act: (app) => {
      for (let i = 0; i < 100; i++) app.addOne(`Todo item ${i + 1}`)
    },
    verify: (c) => expectAddedRows(c, 100),
  },
  {
    name: 'toggle-1000',
    description: 'mark all 1000 active todos completed',
    setup: (app) => app.seed(seedTodos(1000, false)),
    act: (app) => app.toggleAll(true),
    verify: (c) => expectCompleted(c, 1000),
  },
  {
    name: 'clear-1000',
    description: 'clear-completed on a fully-completed 1000-todo list',
    setup: (app) => app.seed(seedTodos(1000, true)),
    act: (app) => app.clearCompleted(),
    verify: (c) => expectRows(c, 0),
  },
]

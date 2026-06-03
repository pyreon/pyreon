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
}

/**
 * The shipped scenarios. Each is a single sync timed region followed by ONE
 * commit, so they isolate render cost cleanly. Sizes differ per scenario:
 *
 * - `add-100` — 100 *rapid-succession* appends (CLAUDE.md scenario d). Pyreon
 *   does 100 incremental keyed-`<For>` inserts; React auto-batches the 100
 *   `setState`s into one render of 100 rows. Both real shapes.
 * - `toggle-1000` / `clear-1000` — bulk operations at 1000 so Pyreon's
 *   fine-grained path stays measurably above the `performance.now()` floor
 *   (at 100 items it reads 0µs — real, but floor-quantized to a useless cv).
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
    verify: (c) => expectRows(c, 100),
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

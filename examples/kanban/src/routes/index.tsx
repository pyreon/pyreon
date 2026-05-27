import { useHead } from '@pyreon/head'
import { For } from '@pyreon/core'
import { signal, computed } from '@pyreon/reactivity'
import { useUrlState } from '@pyreon/url-state'
import { toast } from '@pyreon/toast'
import { useBoardModel, type Column } from '../lib/board'
import BoardColumn from '../components/BoardColumn'

/**
 * Kanban board — top-level page.
 *
 * Filter UX status: the search input is wired to `?q=` via `useUrlState`
 * (shareable URL state, the canonical pattern), but DOES NOT propagate
 * to the per-column card lists. W23 from kanban audit: effects defined
 * inside <For>-mounted components lose subscription to UNRELATED shared
 * signals after the For's source signal notifies once. Until W23 is
 * fixed, the input is left visible to exercise `useUrlState` end-to-end
 * (URL updates correctly, debouncing works) but no card filtering is
 * applied. See WALLS.md for the minimal repro.
 */
export default function BoardPage() {
  useHead({ title: 'Kanban — Pyreon' })

  const board = useBoardModel()

  // URL-synced search term — exercises `@pyreon/url-state` end-to-end.
  // Cards aren't filtered yet (W23). Once W23 is fixed, debounce + filter
  // wiring goes back here.
  const q = useUrlState('q', '')

  const columnIds = computed<string[]>(() =>
    (board.columns() as Column[]).map((c) => c.id),
  )

  const addColumnOpen = signal(false)
  const newColumnTitle = signal('')

  const handleAddColumn = () => {
    const title = newColumnTitle().trim()
    if (!title) return
    board.addColumn(title)
    newColumnTitle.set('')
    addColumnOpen.set(false)
    toast.success(`Column "${title}" added`)
  }

  return (
    <>
      <header class="kanban-header">
        <h1>Kanban</h1>
        <input
          type="search"
          class="kanban-search"
          placeholder="Filter cards… (UX preview — W23)"
          value={() => q()}
          onInput={(e) => q.set((e.currentTarget as HTMLInputElement).value)}
          data-testid="board-search"
        />
        <span class="stats" data-testid="board-stats">
          {() => `${board.columnCount()} columns · ${board.totalCards()} cards`}
        </span>
      </header>

      <div class="kanban-board" data-testid="kanban-board">
        <For each={() => columnIds()} by={(id) => id}>
          {(id) => <BoardColumn columnId={id} />}
        </For>

        {() =>
          addColumnOpen() ? (
            <div class="column">
              <input
                type="text"
                class="kanban-search"
                placeholder="Column title…"
                value={() => newColumnTitle()}
                onInput={(e) =>
                  newColumnTitle.set(
                    (e.currentTarget as HTMLInputElement).value,
                  )
                }
                autoFocus
                data-testid="new-column-input"
              />
              <div class="add-card-form actions" style="margin-top:8px">
                <button
                  type="button"
                  class="btn-primary"
                  onClick={handleAddColumn}
                  data-testid="new-column-add"
                >
                  Add column
                </button>
                <button
                  type="button"
                  class="btn-secondary"
                  onClick={() => {
                    addColumnOpen.set(false)
                    newColumnTitle.set('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              class="add-column-btn"
              onClick={() => addColumnOpen.set(true)}
              data-testid="add-column-btn"
            >
              + Add another column
            </button>
          )
        }
      </div>
    </>
  )
}

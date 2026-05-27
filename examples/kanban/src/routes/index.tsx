import { useHead } from '@pyreon/head'
import { For, provide } from '@pyreon/core'
import { signal, computed } from '@pyreon/reactivity'
import { useDebouncedValue } from '@pyreon/hooks'
import { useUrlState } from '@pyreon/url-state'
import { toast } from '@pyreon/toast'
import { useBoardModel, type Column } from '../lib/board'
import BoardColumn from '../components/BoardColumn'
import { FilterTermCtx } from '../lib/filter-context'

export default function BoardPage() {
  useHead({ title: 'Kanban — Pyreon' })

  const board = useBoardModel()

  // URL-synced + debounced search term — shared with every column via
  // reactive context so each BoardColumn applies the filter to its own
  // state-tree-sourced card list.
  const q = useUrlState('q', '')
  const debouncedQ = useDebouncedValue(q, 200)
  provide(FilterTermCtx, () => debouncedQ())

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
          placeholder="Filter cards…"
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

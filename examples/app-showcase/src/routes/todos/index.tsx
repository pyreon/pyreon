import { provide } from '@pyreon/core'
import { useHotkey } from '@pyreon/hotkeys'
import { signal } from '@pyreon/reactivity'
import { Badge, Button, Card, Input, Kbd, Title } from '@pyreon/ui-components'
import type { UrlStateSignal } from '@pyreon/url-state'
import { useUrlState } from '@pyreon/url-state'
import { TodoList } from '../../sections/todos/TodoList'
import { TodosCtx, type TodosCtxValue } from '../../sections/todos/context'
import { useTodos } from '../../sections/todos/store/todos'
import type { StatusFilter, Todo } from '../../sections/todos/store/types'

/**
 * Todos section — single-page CRUD app demonstrating:
 *   • @pyreon/store     — composition store with derived counts
 *   • @pyreon/storage   — useStorage for cross-tab localStorage persistence
 *   • @pyreon/url-state — status filter and selected project read from URL
 *   • @pyreon/hotkeys   — N add, F focus search, X toggle done, Delete remove
 *   • @pyreon/hooks     — useFocus on the new-todo input
 *
 * Everything in this section runs on the client. Refresh the page or open
 * a second tab — the todos persist and stay in sync via the storage event.
 */
export default function TodosPage() {
  const todosStore = useTodos()
  const { store, patch } = todosStore

  // ── URL state — every filter is reflected in the URL so views are
  //    shareable and the back button works as expected. Cast the default
  //    so TS infers the union instead of the literal `'all'`.
  const status = useUrlState('status', 'all' as StatusFilter)
  const projectId = useUrlState('project', 'all')
  const search = useUrlState('q', '')

  // ── Selection — local UI state, kept in a signal so the keyboard
  //    handlers below can act on the currently focused row.
  const selectedId = signal<string | undefined>(undefined)

  // ── New-todo input ref so hotkey N can focus it without `document`.
  let newTodoEl: HTMLInputElement | null = null
  const setNewTodoRef = (el: HTMLElement | null) => {
    newTodoEl = el as HTMLInputElement | null
  }
  const draft = signal('')

  function submitDraft(e?: Event) {
    e?.preventDefault()
    const title = draft().trim()
    if (!title) return
    const created = store.add({
      title,
      projectId: projectId() === 'all' ? 'inbox' : projectId(),
    })
    draft.set('')
    selectedId.set(created.id)
    newTodoEl?.focus()
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useHotkey('n', () => newTodoEl?.focus(), { description: 'Focus new-todo input' })
  useHotkey('/', () => {
    const input = document.querySelector<HTMLInputElement>('[data-search-input]')
    input?.focus()
  }, { description: 'Focus search' })
  useHotkey('x', () => {
    const id = selectedId()
    if (id) store.toggle(id)
  }, { description: 'Toggle selected todo' })
  useHotkey('delete', () => {
    const id = selectedId()
    if (!id) return
    store.remove(id)
    selectedId.set(undefined)
  }, { description: 'Delete selected todo' })
  useHotkey('escape', () => selectedId.set(undefined), { description: 'Clear selection' })

  // ── Provide the store to descendants so TodoList / TodoItem don't
  //    need to re-call useTodos() and so we can pass the selected-id
  //    signal down with no prop drilling.
  const ctxValue: TodosCtxValue = {
    store,
    patch,
    selectedId,
  }
  provide(TodosCtx, ctxValue)

  // ── Filtering pipeline (read-time, no extra computeds — every signal
  //    read here re-runs the filter on change automatically since it's
  //    inside a reactive accessor below).
  const filtered = (): Todo[] => {
    const q = search().trim().toLowerCase()
    const s = status()
    const p = projectId()
    return store
      .todos()
      .filter((t) => (s === 'all' ? true : s === 'active' ? !t.done : t.done))
      .filter((t) => (p === 'all' ? true : t.projectId === p))
      .filter((t) =>
        !q
          ? true
          : t.title.toLowerCase().includes(q) ||
            (t.notes ?? '').toLowerCase().includes(q),
      )
  }

  return (
    <div style="display: grid; grid-template-columns: 220px 1fr; gap: 24px; padding: 32px 40px; max-width: 1080px;">
      {/* Sidebar — projects */}
      <aside>
        <Title size="h3" style="margin-bottom: 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af;">
          Projects
        </Title>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <ProjectButton label="All projects" color="#9ca3af" active={() => projectId() === 'all'} onClick={() => projectId.set('all')} />
          {() =>
            store.projects().map((p) => (
              <ProjectButton
                label={p.name}
                color={p.color}
                count={() => store.todos().filter((t) => t.projectId === p.id).length}
                active={() => projectId() === p.id}
                onClick={() => projectId.set(p.id)}
              />
            ))
          }
        </div>

        <Title size="h3" style="margin-top: 24px; margin-bottom: 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af;">
          Shortcuts
        </Title>
        <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #6b7280;">
          <ShortcutRow keys={['N']} label="New todo" />
          <ShortcutRow keys={['/']} label="Search" />
          <ShortcutRow keys={['X']} label="Toggle done" />
          <ShortcutRow keys={['Del']} label="Delete" />
          <ShortcutRow keys={['Esc']} label="Clear selection" />
        </div>
      </aside>

      {/* Main column */}
      <div>
        <Title size="h1" style="margin-bottom: 4px">Todos</Title>
        <p style="margin-bottom: 24px; font-size: 14px; color: #6b7280;">
          Persisted to localStorage. Filter state lives in the URL — try refreshing.
        </p>

        {/* Add form */}
        <form onSubmit={submitDraft} style="margin-bottom: 16px;">
          <Card style="padding: 12px; display: flex; gap: 8px; align-items: center;">
            <span style="font-size: 18px; color: #c7d2fe;">+</span>
            <Input
              innerRef={setNewTodoRef}
              type="text"
              placeholder="Add a todo and press Enter…"
              value={draft()}
              onInput={(e: Event) => draft.set((e.target as HTMLInputElement).value)}
              style="border: none; box-shadow: none; padding: 4px 0;"
            />
            <Button state="primary" size="small" disabled={!draft().trim()} onClick={submitDraft}>
              Add
            </Button>
          </Card>
        </form>

        {/* Toolbar — status filter + search */}
        <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px;">
          <FilterTabs status={status} />
          <div style="flex: 1;">
            <Input
              type="text"
              data-search-input
              placeholder="Search todos…"
              value={search()}
              onInput={(e: Event) => search.set((e.target as HTMLInputElement).value)}
            />
          </div>
          {() => {
            const c = store.counts()
            return (
              <Badge state="primary" style="white-space: nowrap;">
                {c.active} active / {c.all} total
              </Badge>
            )
          }}
        </div>

        {/* List */}
        <TodoList items={filtered} />

        {/* Footer */}
        <div style="display: flex; justify-content: space-between; margin-top: 24px; font-size: 13px; color: #6b7280;">
          <span>{() => `${store.counts().completed} completed`}</span>
          <div style="display: flex; gap: 8px;">
            <Button size="small" variant="ghost" onClick={() => store.clearCompleted()}>
              Clear completed
            </Button>
            <Button size="small" variant="ghost" onClick={() => store.resetSeed()}>
              Reset to seed
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProjectButton(props: {
  label: string
  color: string
  count?: () => number
  active: () => boolean
  onClick: () => void
}) {
  const count = props.count
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={() =>
        `display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: none; background: ${props.active() ? '#eef2ff' : 'transparent'}; color: ${props.active() ? '#4338ca' : '#374151'}; font-weight: ${props.active() ? '600' : '400'}; font-size: 13px; border-radius: 6px; cursor: pointer; text-align: left; width: 100%;`
      }
    >
      <span
        style={`display: inline-block; width: 8px; height: 8px; border-radius: 999px; background: ${props.color};`}
      />
      <span style="flex: 1;">{props.label}</span>
      {count ? <span style="font-size: 11px; color: #9ca3af;">{() => count()}</span> : null}
    </button>
  )
}

function ShortcutRow(props: { keys: string[]; label: string }) {
  return (
    <div style="display: flex; align-items: center; gap: 8px;">
      {props.keys.map((k) => (
        <Kbd>{k}</Kbd>
      ))}
      <span>{props.label}</span>
    </div>
  )
}

function FilterTabs(props: { status: UrlStateSignal<StatusFilter> }) {
  const tabs: Array<{ id: StatusFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'completed', label: 'Done' },
  ]
  return (
    <div style="display: flex; gap: 4px; padding: 4px; background: #f3f4f6; border-radius: 8px;">
      {tabs.map((t) => (
        <button
          type="button"
          onClick={() => props.status.set(t.id)}
          style={() =>
            `padding: 4px 12px; font-size: 12px; font-weight: 500; border: none; border-radius: 6px; cursor: pointer; background: ${props.status() === t.id ? 'white' : 'transparent'}; color: ${props.status() === t.id ? '#4338ca' : '#6b7280'}; box-shadow: ${props.status() === t.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'};`
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export const meta = {
  title: 'Todos — Pyreon App Showcase',
}

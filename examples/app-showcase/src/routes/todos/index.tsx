import { provide } from '@pyreon/core'
import { useHotkey } from '@pyreon/hotkeys'
import { signal } from '@pyreon/reactivity'
import { Kbd } from '@pyreon/ui-components'
import type { UrlStateSignal } from '@pyreon/url-state'
import { useUrlState } from '@pyreon/url-state'
import {
  AddCard,
  AddForm,
  AddIcon,
  AddInput,
  CountBadge,
  FilterTab,
  FilterTabsRoot,
  FooterActions,
  FooterBar,
  FooterButton,
  ProjectButtonRoot,
  ProjectCount,
  ProjectLabel,
  ProjectSwatch,
  ShortcutItem,
  ShortcutsList,
  SidebarLabel,
  SidebarSection,
  Toolbar,
  ToolbarSearchSlot,
  TodosLayout,
  TodosLead,
  TodosMain,
  TodosSidebar,
  TodosTitle,
} from '../../sections/todos/styled'
import { TodoList } from '../../sections/todos/TodoList'
import { TodosCtx, type TodosCtxValue } from '../../sections/todos/context'
import { useTodos } from '../../sections/todos/store/todos'
import type { StatusFilter, Todo } from '../../sections/todos/store/types'

/**
 * Todos section — single-page CRUD app demonstrating:
 *   • @pyreon/store     — composition store with derived counts
 *   • @pyreon/storage   — useStorage for cross-tab localStorage persistence
 *   • @pyreon/url-state — status filter and selected project read from URL
 *   • @pyreon/hotkeys   — N add, / focus search, X toggle done, Del remove
 *   • @pyreon/styler    — every visual element is a styled component
 *
 * Everything in this section runs on the client. Refresh the page or open
 * a second tab — the todos persist and stay in sync via the storage event.
 */
export default function TodosPage() {
  const todosStore = useTodos()
  const { store, patch } = todosStore

  // ── URL state — every filter is reflected in the URL so views are
  //    shareable and the back button works as expected.
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
    <TodosLayout>
      <TodosSidebar>
        <SidebarSection>
          <SidebarLabel>Projects</SidebarLabel>
          <ProjectButton
            label="All projects"
            color={tokensFaint}
            active={() => projectId() === 'all'}
            onClick={() => projectId.set('all')}
          />
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
        </SidebarSection>

        <SidebarSection>
          <SidebarLabel>Shortcuts</SidebarLabel>
          <ShortcutsList>
            <ShortcutRow keys={['N']} label="New todo" />
            <ShortcutRow keys={['/']} label="Search" />
            <ShortcutRow keys={['X']} label="Toggle done" />
            <ShortcutRow keys={['Del']} label="Delete" />
            <ShortcutRow keys={['Esc']} label="Clear selection" />
          </ShortcutsList>
        </SidebarSection>
      </TodosSidebar>

      <TodosMain>
        <TodosTitle>Todos</TodosTitle>
        <TodosLead>
          Persisted to localStorage. Filter state lives in the URL — try refreshing.
        </TodosLead>

        <AddForm onSubmit={submitDraft}>
          <AddCard>
            <AddIcon>+</AddIcon>
            <AddInput
              innerRef={setNewTodoRef}
              type="text"
              placeholder="Add a todo and press Enter…"
              value={draft()}
              onInput={(e: Event) => draft.set((e.target as HTMLInputElement).value)}
            />
            <FooterButton state="primary" size="small" disabled={!draft().trim()} onClick={submitDraft}>
              Add
            </FooterButton>
          </AddCard>
        </AddForm>

        <Toolbar>
          <FilterTabs status={status} />
          <ToolbarSearchSlot>
            <AddInput
              type="text"
              data-search-input
              placeholder="Search todos…"
              value={search()}
              onInput={(e: Event) => search.set((e.target as HTMLInputElement).value)}
            />
          </ToolbarSearchSlot>
          {() => {
            const c = store.counts()
            return (
              <CountBadge state="primary">
                {c.active} active / {c.all} total
              </CountBadge>
            )
          }}
        </Toolbar>

        <TodoList items={filtered} />

        <FooterBar>
          <span>{() => `${store.counts().completed} completed`}</span>
          <FooterActions>
            <FooterButton size="small" variant="ghost" onClick={() => store.clearCompleted()}>
              Clear completed
            </FooterButton>
            <FooterButton size="small" variant="ghost" onClick={() => store.resetSeed()}>
              Reset to seed
            </FooterButton>
          </FooterActions>
        </FooterBar>
      </TodosMain>
    </TodosLayout>
  )
}

const tokensFaint = '#9ca3af'

function ProjectButton(props: {
  label: string
  color: string
  count?: () => number
  active: () => boolean
  onClick: () => void
}) {
  const count = props.count
  return (
    <ProjectButtonRoot type="button" onClick={props.onClick} $active={props.active()}>
      <ProjectSwatch $color={props.color} />
      <ProjectLabel>{props.label}</ProjectLabel>
      {count ? <ProjectCount>{() => count()}</ProjectCount> : null}
    </ProjectButtonRoot>
  )
}

function ShortcutRow(props: { keys: string[]; label: string }) {
  return (
    <ShortcutItem>
      {props.keys.map((k) => (
        <Kbd>{k}</Kbd>
      ))}
      <span>{props.label}</span>
    </ShortcutItem>
  )
}

function FilterTabs(props: { status: UrlStateSignal<StatusFilter> }) {
  const tabs: Array<{ id: StatusFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'completed', label: 'Done' },
  ]
  return (
    <FilterTabsRoot>
      {tabs.map((t) => (
        <FilterTab type="button" onClick={() => props.status.set(t.id)} $active={props.status() === t.id}>
          {t.label}
        </FilterTab>
      ))}
    </FilterTabsRoot>
  )
}

export const meta = {
  title: 'Todos — Pyreon App Showcase',
}

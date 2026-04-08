import { provide } from '@pyreon/core'
import { useForm } from '@pyreon/form'
import { useHotkey } from '@pyreon/hotkeys'
import { signal } from '@pyreon/reactivity'
import { rx } from '@pyreon/rx'
import { Kbd } from '@pyreon/ui-components'
import type { UrlStateSignal } from '@pyreon/url-state'
import { useUrlState } from '@pyreon/url-state'
import { TodoList } from '../../sections/todos/TodoList'
import { TodosCtx, type TodosCtxValue } from '../../sections/todos/context'
import {
  AddButton,
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
  SearchInput,
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
import { useTodos } from '../../sections/todos/store/todos'
import type { StatusFilter } from '../../sections/todos/store/types'

/**
 * Todos section — single-page CRUD app demonstrating:
 *   • @pyreon/store     — composition store with derived counts
 *   • @pyreon/storage   — useStorage for cross-tab localStorage persistence
 *   • @pyreon/form      — useForm for the inline add-todo input
 *   • @pyreon/url-state — status / project / search query in the URL
 *   • @pyreon/rx        — pipe-style filter pipeline (search → status → project)
 *   • @pyreon/hotkeys   — N add, / focus search, X toggle done, Del remove
 *   • @pyreon/styler    — every visual element is a styled component
 *
 * Everything in this section runs on the client. Refresh the page or open
 * a second tab — the todos persist and stay in sync via the storage event.
 */
export default function TodosPage() {
  const { store } = useTodos()

  // ── URL state — every filter is reflected in the URL so views are
  //    shareable and the back button works as expected. The default
  //    is cast so TS infers the union type instead of the literal.
  const status = useUrlState('status', 'all' as StatusFilter)
  const projectId = useUrlState('project', 'all')
  const searchQuery = useUrlState('q', '')

  // ── Selection — local UI state, kept in a signal so the keyboard
  //    handlers below can act on the currently focused row.
  const selectedId = signal<string | undefined>(undefined)

  // ── Refs to the new-todo and search inputs so the N and / hotkeys
  //    can focus them without reaching for `document.querySelector`.
  let newTodoEl: HTMLInputElement | null = null
  let searchEl: HTMLInputElement | null = null
  const setNewTodoRef = (el: HTMLElement | null) => {
    newTodoEl = el as HTMLInputElement | null
  }
  const setSearchRef = (el: HTMLElement | null) => {
    searchEl = el as HTMLInputElement | null
  }

  // ── Add form — useForm gives us a single owner of validation +
  //    submission, so the same handler runs whether the user presses
  //    Enter inside the input or clicks the submit button. No
  //    double-submit, no bespoke `submitDraft` glue.
  const addForm = useForm({
    initialValues: { title: '' },
    validators: {
      title: (value) => {
        const trimmed = value.trim()
        if (!trimmed) return 'Title is required'
        if (trimmed.length > 200) return 'Title must be 200 characters or fewer'
        return undefined
      },
    },
    validateOn: 'submit',
    onSubmit: ({ title }) => {
      const created = store.add({
        title,
        projectId: projectId() === 'all' ? 'inbox' : projectId(),
      })
      addForm.reset()
      selectedId.set(created.id)
      newTodoEl?.focus()
    },
  })

  // ── Keyboard shortcuts — every shortcut acts on a typed ref or
  //    a signal, never on `document.querySelector`.
  useHotkey('n', () => newTodoEl?.focus(), { description: 'Focus new-todo input' })
  useHotkey('/', () => searchEl?.focus(), { description: 'Focus search' })
  useHotkey(
    'x',
    () => {
      const id = selectedId()
      if (id) store.toggle(id)
    },
    { description: 'Toggle selected todo' },
  )
  useHotkey(
    'delete',
    () => {
      const id = selectedId()
      if (!id) return
      store.remove(id)
      selectedId.set(undefined)
    },
    { description: 'Delete selected todo' },
  )
  useHotkey('escape', () => selectedId.set(undefined), { description: 'Clear selection' })

  // ── Provide the store to descendants so TodoList / TodoItem don't
  //    need to re-call useTodos() and can react to selection from
  //    anywhere in the section.
  const ctxValue: TodosCtxValue = { store, selectedId }
  provide(TodosCtx, ctxValue)

  // ── Filter pipeline (signal-aware @pyreon/rx) ─────────────────────
  //    rx.combine merges store.todos with the three URL-state filters
  //    into a single Computed<Todo[]>. The result re-derives only when
  //    one of its inputs actually changes, so the list stays cheap to
  //    re-render even with thousands of todos.
  const filtered = rx.combine(
    store.todos,
    searchQuery,
    status,
    (items, q, currentStatus) => {
      const needle = q.trim().toLowerCase()
      return items.filter((todo) => {
        if (currentStatus === 'active' && todo.done) return false
        if (currentStatus === 'completed' && !todo.done) return false
        if (needle) {
          const inTitle = todo.title.toLowerCase().includes(needle)
          const inNotes = (todo.notes ?? '').toLowerCase().includes(needle)
          if (!inTitle && !inNotes) return false
        }
        return true
      })
    },
  )

  // Project filter layered on top — keeps the combine arity at 3 so
  // each rx.combine call has a clear, narrow purpose.
  const visible = rx.combine(filtered, projectId, (items, currentProject) =>
    currentProject === 'all' ? items : items.filter((t) => t.projectId === currentProject),
  )

  return (
    <TodosLayout>
      <TodosSidebar>
        <SidebarSection>
          <SidebarLabel>Projects</SidebarLabel>
          <ProjectButton
            label="All projects"
            color="#9ca3af"
            $active={projectId() === 'all'}
            onClick={() => projectId.set('all')}
          />
          {() =>
            store.projects().map((p) => (
              <ProjectButton
                label={p.name}
                color={p.color}
                count={store.todos().filter((todo) => todo.projectId === p.id).length}
                $active={projectId() === p.id}
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

        <AddForm onSubmit={(e: Event) => addForm.handleSubmit(e)}>
          <AddCard>
            <AddIcon>+</AddIcon>
            <AddInput
              innerRef={setNewTodoRef}
              type="text"
              placeholder="Add a todo and press Enter…"
              value={addForm.fields.title.value()}
              onInput={(e: Event) =>
                addForm.fields.title.setValue((e.target as HTMLInputElement).value)
              }
            />
            <AddButton type="submit" disabled={!addForm.fields.title.value().trim()}>
              Add
            </AddButton>
          </AddCard>
        </AddForm>

        <Toolbar>
          <FilterTabs status={status} />
          <ToolbarSearchSlot>
            <SearchInput
              innerRef={setSearchRef}
              type="text"
              placeholder="Search todos…"
              value={searchQuery()}
              onInput={(e: Event) => searchQuery.set((e.target as HTMLInputElement).value)}
            />
          </ToolbarSearchSlot>
          {() => {
            const counts = store.counts()
            return (
              <CountBadge state="primary">
                {counts.active} active / {counts.all} total
              </CountBadge>
            )
          }}
        </Toolbar>

        <TodoList items={visible} />

        <FooterBar>
          <span>{store.counts().completed} completed</span>
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

interface ProjectButtonProps {
  label: string
  color: string
  count?: number
  $active: boolean
  onClick: () => void
}

function ProjectButton(props: ProjectButtonProps) {
  return (
    <ProjectButtonRoot type="button" onClick={props.onClick} $active={props.$active}>
      <ProjectSwatch $color={props.color} />
      <ProjectLabel>{props.label}</ProjectLabel>
      {props.count !== undefined ? <ProjectCount>{props.count}</ProjectCount> : null}
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
      {tabs.map((tab) => (
        <FilterTab
          type="button"
          onClick={() => props.status.set(tab.id)}
          $active={props.status() === tab.id}
        >
          {tab.label}
        </FilterTab>
      ))}
    </FilterTabsRoot>
  )
}

export const meta = {
  title: 'Todos — Pyreon App Showcase',
}

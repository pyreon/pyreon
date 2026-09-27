import { signal, computed } from '@pyreon/reactivity'
import { For, h } from '@pyreon/core'

type Status = 'todo' | 'in-progress' | 'done'
interface Task {
  id: string
  title: string
  status: Status
}

/**
 * Migrated from `<Playground>` — defineFeature — CRUD from a schema.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function DefineFeatureCRUDFromASchema() {
  // defineFeature() auto-generates list/by-id/create/update/delete
  // hooks from a schema. Here we model the surface inline with
  // signals so you can see what's reactive — the real thing wires
  // the same shape to TanStack Query + @pyreon/form + @pyreon/store.
  const tasks = signal<Task[]>([
    { id: '1', title: 'Write docs',    status: 'done' },
    { id: '2', title: 'Ship feature',  status: 'in-progress' },
    { id: '3', title: 'Review PRs',    status: 'todo' },
  ])
  let nextId = 4

  const draft = signal('')
  const newStatus = signal<Status>('todo')

  const create = () => {
    const t = draft().trim()
    if (!t) return
    tasks.update((all) => [...all, { id: String(nextId++), title: t, status: newStatus() }])
    draft.set('')
  }
  const remove = (id: string) => tasks.update((all) => all.filter((t) => t.id !== id))
  const advance = (id: string) => tasks.update((all) =>
    all.map((t) => {
      if (t.id !== id) return t
      const next: Record<Status, Status> = { todo: 'in-progress', 'in-progress': 'done', done: 'todo' }
      return { ...t, status: next[t.status] }
    }),
  )
  // <For> keys by id, so a status advance patches only that row — but
  // its children callback runs once per key, so a live lookup (not the
  // captured task) is what keeps the badge in sync after the first mount.
  const liveTask = (id: string) => tasks().find((t) => t.id === id)

  const dot = (status: () => Status) =>
    h('span', {
      class: 'badge',
      style: () => ({
        background: ({
          todo: 'transparent',
          'in-progress': '#FFC83D',
          done: '#4ade80',
        } as Record<Status, string>)[status()],
        color: status() === 'todo' ? 'var(--muted)' : '#0A0A0E',
        border: status() === 'todo' ? '1px solid var(--border)' : 'none',
      }),
    }, status)

  const stats = computed(() => {
    const byStatus: Record<Status, number> = { todo: 0, 'in-progress': 0, done: 0 }
    for (const t of tasks()) byStatus[t.status]++
    return byStatus
  })

  return h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('input', {
        placeholder: 'New task…',
        style: { flex: 1, minWidth: '0' },
        onInput: (e: any) => draft.set(e.target.value),
        onKeydown: (e: any) => { if (e.key === 'Enter') create() },
      }),
      h('select', {
        onChange: (e: any) => newStatus.set(e.target.value),
      },
        h('option', { value: 'todo' }, 'To Do'),
        h('option', { value: 'in-progress' }, 'In Progress'),
        h('option', { value: 'done' }, 'Done'),
      ),
      h('button', { onClick: create }, '＋ Create'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'col', style: { gap: '4px' } },
        h(For, {
          each: () => tasks(),
          by: (t: Task) => t.id,
          children: (t: Task) =>
            h('div', { class: 'row', style: { justifyContent: 'space-between', padding: '4px 0' } },
              h('span', { style: { flex: 1 } }, t.title),
              dot(() => liveTask(t.id)?.status ?? t.status),
              h('button', {
                onClick: () => advance(t.id),
                style: { padding: '2px 8px', fontSize: '12px' },
              }, '↻ next'),
              h('button', {
                onClick: () => remove(t.id),
                style: { padding: '2px 8px', fontSize: '12px' },
              }, '✕'),
            ),
        }),
      ),
    ),
    h('div', { class: 'muted' }, () =>
      'todo: ' + stats().todo + ' · in-progress: ' + stats()['in-progress'] + ' · done: ' + stats().done,
    ),
  )
}

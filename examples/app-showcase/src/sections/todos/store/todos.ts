import { computed } from '@pyreon/reactivity'
import { useStorage } from '@pyreon/storage'
import { defineStore } from '@pyreon/store'
import type { Project, Todo } from './types'

/** Hard-coded built-in projects. Inbox is pinned and can't be deleted. */
const DEFAULT_PROJECTS: Project[] = [
  { id: 'inbox', name: 'Inbox', color: '#6366f1', pinned: true },
  { id: 'work', name: 'Work', color: '#0ea5e9' },
  { id: 'personal', name: 'Personal', color: '#10b981' },
]

/** Seed todos shown on first load so the UI isn't empty. */
const SEED_TODOS: Todo[] = [
  {
    id: 't1',
    title: 'Try keyboard shortcut N to add a todo',
    notes: 'Then ↑/↓ to navigate, X to toggle done, Delete to remove.',
    done: false,
    projectId: 'inbox',
    priority: 'high',
    tags: ['demo'],
    createdAt: '2026-04-01T09:00:00.000Z',
  },
  {
    id: 't2',
    title: 'Switch the status filter using the URL',
    notes: 'Try ?status=active or ?status=completed — the URL is the source of truth.',
    done: false,
    projectId: 'inbox',
    priority: 'medium',
    tags: ['demo', 'url-state'],
    createdAt: '2026-04-01T09:05:00.000Z',
  },
  {
    id: 't3',
    title: 'Read the data layer source',
    done: true,
    projectId: 'inbox',
    tags: ['demo'],
    createdAt: '2026-04-01T08:00:00.000Z',
    completedAt: '2026-04-01T09:30:00.000Z',
  },
  {
    id: 't4',
    title: 'Plan Q2 roadmap',
    notes: 'Pick top 3 themes — performance, docs, plugin ecosystem.',
    done: false,
    projectId: 'work',
    priority: 'high',
    tags: ['planning'],
    createdAt: '2026-04-02T10:00:00.000Z',
    dueDate: '2026-04-15',
  },
  {
    id: 't5',
    title: 'Buy groceries',
    done: false,
    projectId: 'personal',
    priority: 'low',
    tags: ['shopping'],
    createdAt: '2026-04-03T18:00:00.000Z',
  },
]

/** Generate a short, unique-enough id. Sufficient for client-side todos. */
function nextId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Todos store — composition pattern over @pyreon/store + @pyreon/storage.
 *
 * Both `todos` and `projects` are reactive `useStorage` signals, so every
 * mutation persists to localStorage automatically and stays synced across
 * browser tabs. The store layer adds a small action API on top.
 */
export const useTodos = defineStore('todos', () => {
  const todos = useStorage<Todo[]>('app-showcase.todos', SEED_TODOS)
  const projects = useStorage<Project[]>('app-showcase.projects', DEFAULT_PROJECTS)

  // ── Derived ────────────────────────────────────────────────────────────
  const counts = computed(() => {
    const all = todos()
    let active = 0
    let completed = 0
    for (const t of all) {
      if (t.done) completed++
      else active++
    }
    return { all: all.length, active, completed }
  })

  // ── Actions ────────────────────────────────────────────────────────────
  function add(input: {
    title: string
    notes?: string
    projectId?: string
    priority?: Todo['priority']
    tags?: string[]
    dueDate?: string
  }): Todo {
    const todo: Todo = {
      id: nextId(),
      title: input.title.trim(),
      notes: input.notes?.trim() || undefined,
      done: false,
      projectId: input.projectId ?? 'inbox',
      priority: input.priority,
      tags: input.tags ?? [],
      createdAt: new Date().toISOString(),
      dueDate: input.dueDate,
    }
    todos.set([todo, ...todos()])
    return todo
  }

  function update(id: string, patch: Partial<Omit<Todo, 'id' | 'createdAt'>>) {
    todos.set(todos().map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function toggle(id: string) {
    todos.set(
      todos().map((t) => {
        if (t.id !== id) return t
        const done = !t.done
        return {
          ...t,
          done,
          completedAt: done ? new Date().toISOString() : undefined,
        }
      }),
    )
  }

  function remove(id: string) {
    todos.set(todos().filter((t) => t.id !== id))
  }

  function clearCompleted() {
    todos.set(todos().filter((t) => !t.done))
  }

  function reorder(fromId: string, toId: string) {
    const list = todos().slice()
    const from = list.findIndex((t) => t.id === fromId)
    const to = list.findIndex((t) => t.id === toId)
    if (from < 0 || to < 0 || from === to) return
    const [moved] = list.splice(from, 1)
    if (!moved) return
    list.splice(to, 0, moved)
    todos.set(list)
  }

  function addProject(name: string, color = '#6366f1'): Project {
    const project: Project = { id: nextId(), name: name.trim(), color }
    projects.set([...projects(), project])
    return project
  }

  function removeProject(id: string) {
    if (id === 'inbox') return // pinned
    projects.set(projects().filter((p) => p.id !== id))
    // Move orphaned todos back to inbox
    todos.set(todos().map((t) => (t.projectId === id ? { ...t, projectId: 'inbox' } : t)))
  }

  function resetSeed() {
    todos.set(SEED_TODOS)
    projects.set(DEFAULT_PROJECTS)
  }

  return {
    todos,
    projects,
    counts,
    add,
    update,
    toggle,
    remove,
    clearCompleted,
    reorder,
    addProject,
    removeProject,
    resetSeed,
  }
})

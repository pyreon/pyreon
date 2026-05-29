import { useHead } from '@pyreon/head'
import { useI18n } from '@pyreon/i18n'
import { defineFeature } from '@pyreon/feature'
import { toast } from '@pyreon/toast'
import { z } from 'zod'

/**
 * Todos page — exercises `@pyreon/feature` with a localStorage-backed
 * mock fetcher (no real backend). Auto-generates CRUD primitives from
 * a Zod schema: `useList`, `useCreate`, `useDelete`, `useForm`,
 * `useStore`.
 *
 * Real HN is a read-only API, so we use a self-managed todos resource
 * here purely to demonstrate the feature() pattern. The mock fetcher
 * keeps state in `localStorage` so the demo survives reload + provides
 * a real CRUD surface for the feature's mutations to call.
 */
const todoSchema = z.object({
  id: z.number(),
  title: z.string().min(1, 'Required'),
  done: z.boolean(),
  createdAt: z.number(),
})

type Todo = z.infer<typeof todoSchema>

const STORAGE_KEY = 'hn-todos'

function readTodos(): Todo[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Todo[]) : []
  } catch {
    return []
  }
}
function writeTodos(todos: Todo[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  } catch {
    /* silent */
  }
}

// ── Mock fetcher: pretend `/api/todos` is a REST endpoint backed by
//    localStorage. defineFeature's CRUD ops will call this fetcher with
//    the standard verbs (GET list, POST create, PUT update, DELETE).
// Cast to `typeof fetch` despite missing `preconnect` — feature's
// fetcher only calls the function form, never reads helper attributes.
const mockFetcher = (async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString()
  const method = (init?.method ?? 'GET').toUpperCase()
  const body = init?.body ? (JSON.parse(init.body as string) as Partial<Todo>) : undefined

  // Match `/api/todos` or `/api/todos/:id`
  const m = url.match(/\/api\/todos(?:\/(\d+))?$/)
  if (!m) return new Response('Not Found', { status: 404 })
  const id = m[1] ? Number(m[1]) : null

  const todos = readTodos()
  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  if (method === 'GET' && id == null) return respond(todos)
  if (method === 'GET' && id != null) {
    const t = todos.find((x) => x.id === id)
    return t ? respond(t) : respond({ error: 'Not found' }, 404)
  }
  if (method === 'POST') {
    const nextId = (todos.reduce((max, t) => Math.max(max, t.id), 0) || 0) + 1
    const created: Todo = {
      id: nextId,
      title: body?.title ?? '',
      done: false,
      createdAt: Date.now(),
    }
    writeTodos([...todos, created])
    return respond(created, 201)
  }
  if (method === 'PUT' && id != null) {
    const idx = todos.findIndex((x) => x.id === id)
    if (idx === -1) return respond({ error: 'Not found' }, 404)
    const updated: Todo = { ...todos[idx]!, ...body, id }
    const next = [...todos]
    next[idx] = updated
    writeTodos(next)
    return respond(updated)
  }
  if (method === 'DELETE' && id != null) {
    writeTodos(todos.filter((x) => x.id !== id))
    // 204 No Content — must NOT include a body or Response constructor throws.
    return new Response(null, { status: 204 })
  }
  return respond({ error: 'Bad request' }, 400)
}) as typeof fetch

const Todos = defineFeature<Todo>({
  name: 'todos',
  api: '/api/todos',
  schema: todoSchema,
  fetcher: mockFetcher,
  initialValues: { title: '', done: false, id: 0, createdAt: 0 },
})

export default function TodosPage() {
  const { t: _t } = useI18n()
  useHead(() => ({ title: 'Todos — Hacker News (Pyreon)' }))

  const list = Todos.useList()
  const create = Todos.useCreate()
  const del = Todos.useDelete()
  const update = Todos.useUpdate()

  const form = Todos.useForm({
    onSuccess: () => {
      toast.success('Todo added')
      // Refetch list — query observer auto-invalidates on the same key.
    },
    onError: (err) =>
      toast.error(`Create failed: ${err instanceof Error ? err.message : String(err)}`),
  })

  const handleToggle = (todo: Todo) => {
    update.mutate({ id: todo.id, data: { done: !todo.done } })
  }
  const handleDelete = (todo: Todo) => {
    del.mutate(todo.id)
    toast.info(`Deleted "${todo.title}"`)
  }

  return (
    <section class="todos-page">
      <header>
        <h1>Todos (feature demo)</h1>
        <p>
          Demonstrates <code>defineFeature()</code> with a mock localStorage fetcher. Real HN is
          read-only, so this is a self-contained CRUD surface to show the feature primitives.
        </p>
      </header>

      <form
        class="todo-create-form"
        onSubmit={(e: Event) => form.handleSubmit(e)}
        style="display:flex;gap:8px;margin:16px 0"
      >
        <input
          type="text"
          placeholder="New todo title…"
          value={() => (form.fields.title.value() as string) ?? ''}
          onInput={(e) => form.fields.title.setValue((e.currentTarget as HTMLInputElement).value)}
          style="flex:1;padding:8px"
          data-testid="todo-input"
        />
        <button
          type="submit"
          class="btn-primary"
          disabled={() => form.isSubmitting()}
          data-testid="todo-create"
        >
          Add
        </button>
      </form>

      {() => {
        if (list.isPending()) return <div class="feed-state">Loading todos…</div>
        if (list.isError())
          return <div class="feed-state error">{String(list.error() ?? 'unknown error')}</div>
        const todos = (list.data() ?? []) as Todo[]
        if (todos.length === 0) return <div class="feed-state">No todos yet. Add one above.</div>
        return (
          <ul class="todo-list" style="list-style:none;padding:0">
            {todos.map((todo) => (
              <li
                class="todo-row"
                data-testid={`todo-${todo.id}`}
                style="display:flex;gap:8px;padding:8px;border-bottom:1px solid #eee;align-items:center"
              >
                <input type="checkbox" checked={todo.done} onChange={() => handleToggle(todo)} />
                <span style={todo.done ? 'text-decoration:line-through;color:#999' : ''}>
                  {todo.title}
                </span>
                <span style="margin-left:auto;font-size:12px;color:#999">
                  {new Date(todo.createdAt).toLocaleString()}
                </span>
                <button
                  type="button"
                  class="link-btn"
                  onClick={() => handleDelete(todo)}
                  data-testid={`todo-delete-${todo.id}`}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        )
      }}

      <p style="margin-top:16px;font-size:12px;color:#999">
        Total created: {() => (list.data() ?? []).length} ·{' '}
        {() => (create.isPending() ? 'creating…' : 'idle')}
      </p>
    </section>
  )
}

import { defineFeature } from '@pyreon/feature'
import { For } from '@pyreon/core'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { z } from 'zod'

// ─── In-memory mock REST backend ────────────────────────────────────────
// `@pyreon/feature` accepts a custom `fetcher` (any function matching
// `typeof fetch`) so we don't need a real server. The mock handles
// GET /api/tasks, POST /api/tasks, PUT /api/tasks/:id, DELETE /api/tasks/:id.
interface Task {
  id: string
  title: string
  done: boolean
}

let tasks: Task[] = [
  { id: '1', title: 'Read the manifest', done: true },
  { id: '2', title: 'Define a feature', done: false },
  { id: '3', title: 'Open a PR', done: false },
]
let nextId = 4

async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // 250-450ms simulated network delay
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 200))
  const url = typeof input === 'string' ? input : input.toString()
  const method = init?.method ?? 'GET'
  const idMatch = url.match(/\/api\/tasks\/([^/?]+)$/)
  const id = idMatch?.[1]

  if (url.startsWith('/api/tasks') && !id && method === 'GET') {
    return new Response(JSON.stringify(tasks), { status: 200 })
  }
  if (url === '/api/tasks' && method === 'POST') {
    const body = JSON.parse((init?.body as string) ?? '{}') as Partial<Task>
    const task: Task = {
      id: String(nextId++),
      title: body.title ?? 'Untitled',
      done: body.done ?? false,
    }
    tasks = [...tasks, task]
    return new Response(JSON.stringify(task), { status: 201 })
  }
  if (id && method === 'PUT') {
    const body = JSON.parse((init?.body as string) ?? '{}') as Partial<Task>
    tasks = tasks.map((t) => (t.id === id ? { ...t, ...body, id } : t))
    const updated = tasks.find((t) => t.id === id)
    return new Response(JSON.stringify(updated), { status: 200 })
  }
  if (id && method === 'DELETE') {
    tasks = tasks.filter((t) => t.id !== id)
    return new Response(null, { status: 204 })
  }
  return new Response('not found', { status: 404 })
}

// ─── Feature definition ──────────────────────────────────────────────────
// `id` is required on persisted rows (server-assigned). `useCreate`
// takes `Partial<TValues>` so the create form can still omit it.
const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(2, 'Title must be at least 2 chars'),
  done: z.boolean().default(false),
})

const taskFeature = defineFeature({
  name: 'tasks',
  schema: taskSchema,
  api: '/api/tasks',
  fetcher: mockFetch,
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 } },
})

function FeatureContent() {
  // useList — paginated/filtered list query. Returns UseQueryResult<Task[]>.
  const list = taskFeature.useList()

  // useCreate — POST mutation. Returns UseMutationResult<Task, ..., Partial<Task>>.
  const createMut = taskFeature.useCreate()

  // useUpdate — PUT mutation with optimistic updates.
  const updateMut = taskFeature.useUpdate()

  // useDelete — DELETE mutation.
  const deleteMut = taskFeature.useDelete()

  // Search reactively over a signal — useSearch wires a debounced query.
  const term = signal('')
  const search = taskFeature.useSearch(term)

  // Local input state
  const newTitle = signal('')

  return (
    <div>
      <h2>Feature</h2>
      <p class="desc">
        Schema-driven CRUD primitives — one <code>defineFeature(...)</code> call generates{' '}
        <code>useList</code> / <code>useById</code> / <code>useSearch</code> /{' '}
        <code>useCreate</code> / <code>useUpdate</code> / <code>useDelete</code> against a REST API.
        Composes <code>@pyreon/query</code> + <code>@pyreon/form</code> + <code>@pyreon/store</code>{' '}
        + <code>@pyreon/table</code> + <code>@pyreon/validation</code>. This demo runs against an
        in-memory mock fetcher (see the demo source).
      </p>

      <div class="section">
        <h3>Schema introspection</h3>
        <p style="font-size: 13px; color: #666; margin-bottom: 8px">
          <code>feature.fields</code> — auto-extracted from the Zod schema:
        </p>
        <pre style="font-size: 13px" data-testid="feature-fields">
          {() => JSON.stringify(taskFeature.fields, null, 2)}
        </pre>
      </div>

      <div class="section">
        <h3>useList</h3>
        <div data-testid="feature-list">
          {() =>
            list.isLoading() ? (
              <p>Loading…</p>
            ) : list.error() ? (
              <p class="error">Error: {String(list.error())}</p>
            ) : (
              <ul style="list-style:none; padding:0">
                <For each={list.data() ?? []} by={(t) => t.id}>
                  {(task) => (
                    <li
                      data-testid={`feature-task-${task.id}`}
                      style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #eee"
                    >
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={(e) =>
                          updateMut.mutate({
                            id: task.id,
                            data: { done: e.currentTarget.checked },
                          })
                        }
                        style="width:auto; margin:0"
                      />
                      <span
                        style={
                          task.done ? 'flex:1; text-decoration:line-through; color:#999' : 'flex:1'
                        }
                      >
                        {task.title}
                      </span>
                      <button
                        class="danger"
                        data-testid={`feature-delete-${task.id}`}
                        onClick={() => deleteMut.mutate(task.id)}
                      >
                        delete
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            )
          }
        </div>
      </div>

      <div class="section">
        <h3>useCreate</h3>
        <div class="row">
          <input
            type="text"
            data-testid="feature-new-title"
            placeholder="New task title…"
            value={() => newTitle()}
            onInput={(e) => newTitle.set(e.currentTarget.value)}
          />
          <button
            class="primary"
            data-testid="feature-add"
            disabled={() => createMut.isPending() || !newTitle().trim()}
            onClick={() => {
              const title = newTitle().trim()
              if (!title) return
              createMut.mutate({ title, done: false })
              newTitle.set('')
            }}
          >
            {() => (createMut.isPending() ? 'Adding…' : 'Add')}
          </button>
        </div>
      </div>

      <div class="section">
        <h3>useSearch — reactive query</h3>
        <input
          type="text"
          data-testid="feature-search"
          placeholder="Type to search by title…"
          value={() => term()}
          onInput={(e) => term.set(e.currentTarget.value)}
        />
        <div style="margin-top:12px" data-testid="feature-search-results">
          {() =>
            term().trim() === '' ? (
              <p style="font-size:13px; color:#666">(type a term above to see matching tasks)</p>
            ) : search.isLoading() ? (
              <p style="font-size:13px; color:#666">Searching…</p>
            ) : (search.data() ?? []).length === 0 ? (
              <p style="font-size:13px; color:#666">No matches.</p>
            ) : (
              <ul style="list-style:none; padding:0; font-size:13px">
                {(search.data() ?? []).map((t) => (
                  <li>• {t.title}</li>
                ))}
              </ul>
            )
          }
        </div>
      </div>

      <div class="section">
        <h3>Mutation state</h3>
        <p style="font-size:13px">
          create:{' '}
          <span class={() => (createMut.isPending() ? 'badge blue' : 'badge gray')}>
            {() => (createMut.isPending() ? 'pending' : 'idle')}
          </span>
          {' · '}
          update:{' '}
          <span class={() => (updateMut.isPending() ? 'badge blue' : 'badge gray')}>
            {() => (updateMut.isPending() ? 'pending' : 'idle')}
          </span>
          {' · '}
          delete:{' '}
          <span class={() => (deleteMut.isPending() ? 'badge blue' : 'badge gray')}>
            {() => (deleteMut.isPending() ? 'pending' : 'idle')}
          </span>
        </p>
      </div>
    </div>
  )
}

export function FeatureDemo() {
  return (
    <QueryClientProvider client={queryClient}>
      <FeatureContent />
    </QueryClientProvider>
  )
}

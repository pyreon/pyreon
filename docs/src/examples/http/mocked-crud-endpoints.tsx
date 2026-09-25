import { For, onMount } from '@pyreon/core'
import { createHttp } from '@pyreon/http'
import { mock } from '@pyreon/http/mock'
import { standardSchema } from '@pyreon/http/schema'
import { signal } from '@pyreon/reactivity'
import { z } from 'zod'

const TaskSchema = z.object({ id: z.string(), title: z.string() })
type Task = z.infer<typeof TaskSchema>

let nextId = 3
const seed: Task[] = [
  { id: '1', title: 'Write docs' },
  { id: '2', title: 'Ship it' },
]

// `mock()` short-circuits the middleware chain — no real network, no MSW,
// no fetch monkey-patch. `createHttp`'s own tiny router picks a matching
// route by method + path; a POST here appends to `seed` so the list
// endpoint reflects it on the next GET, same as a real backend would.
const api = createHttp({
  baseUrl: '/api',
  schema: standardSchema, // enables `response:` on endpoint() below
  use: [
    mock([
      { method: 'GET', path: '/tasks', json: seed },
      {
        method: 'POST',
        path: '/tasks',
        status: 201,
        json: { id: String(nextId++), title: 'New task' },
      },
    ]),
  ],
})

// One declaration gives you the URL, the queryKey shape (via
// `endpoint.query()`), and the response type + runtime validation
// together — no drift between a hand-written key and a hand-written URL,
// and a mismatched mock/backend response throws instead of lying about
// its type.
const listTasks = api.endpoint('GET /tasks', { response: TaskSchema.array() })
const createTask = api.endpoint('POST /tasks', { response: TaskSchema })

/**
 * The live counterpart to the Endpoints section above — a REAL
 * `@pyreon/http` client with a mocked transport, not a fetch() stub.
 */
export default function MockedCrudEndpoints() {
  const tasks = signal<Task[]>([])
  const status = signal<'idle' | 'loading' | 'error'>('idle')

  const load = async () => {
    status.set('loading')
    try {
      tasks.set(await listTasks())
      status.set('idle')
    } catch {
      status.set('error')
    }
  }

  const add = async () => {
    await createTask()
    await load()
  }

  onMount(() => {
    void load()
  })

  return (
    <div class="col">
      <div class="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span class="muted">GET /tasks · POST /tasks (mocked, no network)</span>
        <button onClick={() => void add()}>＋ add via POST</button>
      </div>
      <div class="card">
        {() => {
          if (status() === 'loading') return <div class="muted">loading…</div>
          if (status() === 'error') return <div style={{ color: '#FF1F8C' }}>request failed</div>
          return (
            <div class="col" style={{ gap: '4px' }}>
              <For each={() => tasks()} by={(t) => t.id}>
                {(t) => <div class="row">{t.title}</div>}
              </For>
            </div>
          )
        }}
      </div>
    </div>
  )
}

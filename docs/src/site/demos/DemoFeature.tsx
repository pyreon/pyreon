import { For, onMount, onUnmount, Show } from '@pyreon/core'
import { defineFeature, type Feature } from '@pyreon/feature'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { z } from 'zod'
import { font, motion, paper, text, weight } from '../theme'
import { el, focusRing, tone, txt, type ButtonAttrs } from '../kit/bases'
import { DemoSurface } from '../kit/cards'
import { DemoGrid, DemoPanel, Meters, PaperButton, PaperError, PaperField, PaperHint } from '../kit/demo'
import { Code } from '../kit/type'

const schema = z.object({
  title: z.string().trim().min(1, 'Enter a title'),
  published: z.boolean(),
})
type Post = z.infer<typeof schema>
type Row = Post & { id: number }
type PostsFeature = Feature<Post>

const API = '/api/posts'
/** The mock server's answer time: long enough to see the list refetch. */
const LATENCY = 350

const MEMBERS = {
  useList: 'Paginated list query (GET /api/posts), cached and refetched automatically.',
  useById: 'One record by ID (GET /api/posts/:id), reactive to an id accessor.',
  useSearch:
    'A search query that refetches when the term signal changes (sent as ?q=), disabled while the term is empty. It is not debounced; pair it with a debounced signal (e.g. debounce from @pyreon/rx) if you need that.',
  useCreate: 'Create mutation (POST /api/posts); invalidates the list on success.',
  useUpdate: 'Update mutation (PUT /api/posts/:id), optimistic, rolled back on error; invalidates the list.',
  useDelete: 'Delete mutation (DELETE /api/posts/:id); invalidates the list on success.',
  useForm: 'A @pyreon/form form validated by the feature schema; submits to the API.',
  useTable: 'A @pyreon/table instance with columns inferred from the schema.',
  useStore: 'A store for cached items, selection and loading state.',
  fields: 'Introspected field metadata for building forms:',
  schema: 'The schema itself, for reuse anywhere.',
} as const
type Member = keyof typeof MEMBERS
const MEMBER_KEYS = Object.keys(MEMBERS) as Member[]

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * The in-page API: an in-memory table behind `defineFeature`'s own `fetcher`
 * option, so nothing leaves the page and the global `fetch` is untouched.
 */
function createMockApi(onRequest: (method: string, path: string) => void) {
  let rows: Row[] = [
    { id: 1, title: 'Launch checklist', published: true },
    { id: 2, title: 'Q4 roadmap', published: false },
  ]
  let nextId = 3
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const fetcher = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : null
    const url = new URL(req ? req.url : String(input), 'http://mock.local')
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase()
    const abort = init?.signal ?? req?.signal ?? null
    const bodyText = init?.body != null ? String(init.body) : req ? req.text() : Promise.resolve('')
    onRequest(method, url.pathname === API ? API : `${API}/:id`)

    return new Promise<Response>((resolve, reject) => {
      // The latency IS the demo (the list visibly refetches); cleared on teardown.
      // pyreon-lint-disable-next-line pyreon/no-raw-setinterval
      const t = setTimeout(async () => {
        timers.delete(t)
        const id = Number(url.pathname.slice(API.length + 1))
        if (method === 'GET' && url.pathname === API) {
          resolve(json(rows))
        } else if (method === 'POST' && url.pathname === API) {
          const data = JSON.parse(await bodyText) as Post
          if (rows.some((r) => r.title.toLowerCase() === data.title.toLowerCase())) {
            resolve(json({ message: `A post called "${data.title}" already exists` }, 409))
            return
          }
          const row = { id: nextId++, title: data.title, published: Boolean(data.published) }
          rows = [...rows, row]
          resolve(json(row, 201))
        } else if (method === 'DELETE' && Number.isFinite(id)) {
          rows = rows.filter((r) => r.id !== id)
          resolve(json(null, 204))
        } else {
          resolve(json({ message: 'Not found' }, 404))
        }
      }, LATENCY)
      timers.add(t)
      // A per-request AbortSignal: the listener goes away with the request.
      // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener
      abort?.addEventListener('abort', () => {
        clearTimeout(t)
        timers.delete(t)
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })
  }

  const dispose = () => {
    for (const t of timers) clearTimeout(t)
    timers.clear()
  }
  return { fetcher: fetcher as typeof fetch, dispose }
}

const Stack = el.config({ name: 'FtStack' }).attrs({ block: true, gap: 14, contentAlignX: 'block' })

const Pick = el
  .config({ name: 'FtPick' })
  .attrs({ tag: 'fieldset', block: true })
  .theme(() => ({
    margin: 0,
    padding: 0,
    border: 'none',
    minWidth: 0,
    // Element renders a fieldset's content in an inner flex box; lay that out.
    extendCss: '& > div { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; }',
  }))

const PickButton = el
  .config({ name: 'FtPickButton' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignX: 'center', contentAlignY: 'center' })
  .theme((_t, m) => ({
    height: 38,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 10,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: 'transparent',
    color: tone(m, 'mist'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    transition: `border-color ${motion.hover}, background-color ${motion.hover}, color ${motion.hover}`,
    hover: { borderColor: tone(m, 'lineHover'), color: tone(m, 'text') },
    focus: focusRing(m),
    pressed: { borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'currentFill'), color: tone(m, 'text') },
  }))

const Label = txt
  .config({ name: 'FtLabel' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'fog') }))

const Describe = txt
  .config({ name: 'FtDescribe' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, minHeight: 66, fontSize: text.ui.size, lineHeight: 1.6, color: tone(m, 'mist') }))

const AddRow = el
  .config({ name: 'FtAddRow' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 8,
    alignItems: 'center',
    extendCss: '& button { white-space: nowrap; }',
  }))

const TableBox = el
  .config({ name: 'FtTableBox' })
  .attrs({ block: true })
  .theme(() => ({
    minWidth: 0,
    overflowX: 'auto',
    extendCss: `
      & table { width: 100%; border-collapse: collapse; font-size: 14px; color: ${paper.text}; }
      & th { text-align: left; padding: 6px 4px; border-bottom: 1px solid ${paper.line}; font-size: 12px; font-weight: ${weight.semibold}; color: ${paper.fog}; }
      & td { padding: 6px 4px; border-bottom: 1px solid ${paper.line}; }
      & td:last-child { text-align: right; }
      & caption { text-align: left; caption-side: top; padding-bottom: 6px; font-size: 12.5px; color: ${paper.fog}; }
    `,
  }))

const Status = txt
  .config({ name: 'FtStatus' })
  .attrs({ tag: 'span' })
  .theme(() => ({ fontFamily: font.mono, fontSize: 12, color: paper.fog }))

const Note = txt
  .config({ name: 'FtNote' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ color: tone(m, 'text'), fontWeight: weight.medium }))

function PostsTable(props: { posts: PostsFeature }) {
  const list = props.posts.useList()
  const create = props.posts.useCreate()
  const remove = props.posts.useDelete()
  const title = signal('')
  const invalid = signal('')

  const add = (e: Event) => {
    e.preventDefault()
    const parsed = schema.safeParse({ title: title.peek(), published: false })
    if (!parsed.success) {
      invalid.set(`title: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
      return
    }
    invalid.set('')
    create.mutate(parsed.data, { onSuccess: () => title.set('') })
  }

  const error = () => invalid() || (create.error() ? (create.error() as Error).message : '')
  const rows = () => (list.data() ?? []) as Row[]

  return (
    <Stack>
      <form onSubmit={add} aria-label="New post" noValidate>
      <AddRow>
        <PaperField>
          <input
            aria-label="New post title"
            placeholder="New post title"
            autoComplete="off"
            value={title()}
            aria-invalid={error() ? 'true' : 'false'}
            aria-describedby="ft-demo-error"
            onInput={(e: Event) => {
              title.set((e.target as HTMLInputElement).value)
              if (invalid.peek()) invalid.set('')
              if (create.error.peek()) create.reset()
            }}
          />
        </PaperField>
        <PaperButton type="submit" variant="primary" disabled={create.isPending()}>
          useCreate()
        </PaperButton>
      </AddRow>
      </form>
      <PaperError id="ft-demo-error" aria-live="polite">
        {() => error()}
      </PaperError>
      <TableBox>
        <table>
          <caption>
            <Status aria-live="polite">
              {() => (list.isPending() ? 'useList(): loading…' : list.isFetching() ? 'useList(): refetching…' : `useList(): ${rows().length} posts`)}
            </Status>
          </caption>
          <thead>
            <tr>
              <th scope="col">title</th>
              <th scope="col">published</th>
              <th scope="col">
                <span hidden>actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <For each={rows} by={(r) => r.id}>
              {(r) => (
                <tr>
                  <td>{r.title}</td>
                  <td>{r.published ? 'yes' : 'no'}</td>
                  <td>
                    <PaperButton type="button" aria-label={`Delete "${r.title}" (useDelete)`} onClick={() => remove.mutate(r.id)}>
                      useDelete()
                    </PaperButton>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </TableBox>
      <PaperHint>Try an empty title, or one that exists: the schema and the server answer.</PaperHint>
    </Stack>
  )
}

/**
 * Feature demo (`feature.json` → demo): one real `defineFeature` from
 * `@pyreon/feature` (Zod schema, `/api/posts`). The table uses the generated
 * `useList`, `useCreate` and `useDelete` under a real `QueryClientProvider`;
 * the API is an in-memory mock wired through the feature's own `fetcher`
 * option. Creating or deleting invalidates the list, which refetches (watch
 * the request counters). The picker on the card describes every generated
 * member; `fields` lists the real introspected fields.
 *
 * Teardown: a zero island is never unmounted on client-side navigation (its
 * hydration root is not disposed; reported with the products-b demos), so the
 * provider (which mounts the client's focus/online listeners) renders inside a
 * `Show` this demo closes once its root leaves the document.
 */
export default function DemoFeature() {
  const counts = { GET: signal(0), POST: signal(0), DELETE: signal(0) }
  const api = createMockApi((method) => {
    const c = counts[method as keyof typeof counts]
    c?.update((n) => n + 1)
  })
  const posts = defineFeature({ name: 'posts', schema, api: API, fetcher: api.fetcher })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } })

  const member = signal<Member>('useCreate')
  const alive = signal(true)
  let root: HTMLElement | null = null
  let observer: MutationObserver | undefined
  const stop = () => {
    observer?.disconnect()
    alive.set(false)
    api.dispose()
    client.clear()
  }
  onMount(() => {
    observer = new MutationObserver(() => {
      if (!root?.isConnected) stop()
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
  onUnmount(stop)

  const fieldList = posts.fields.map((f) => `${f.name} (${f.type})`).join(', ')
  const describe = (m: Member) => (m === 'fields' ? `${MEMBERS.fields} ${fieldList}.` : MEMBERS[m])

  return (
    <div
      ref={(e: Element | null) => {
        root = e as HTMLElement | null
      }}
    >
      <DemoGrid>
        <DemoPanel>
          <Stack>
            <Label id="ft-demo-members">posts = defineFeature(…)</Label>
            <Pick aria-labelledby="ft-demo-members">
              <For each={MEMBER_KEYS} by={(k) => k}>
                {(k) => (
                  <PickButton type="button" aria-pressed={() => (member() === k ? 'true' : 'false')} onClick={() => member.set(k)}>
                    {k}
                  </PickButton>
                )}
              </For>
            </Pick>
            <Describe aria-live="polite">
              <Note>
                <Code>{() => `posts.${member()}`}</Code>
              </Note>
              {() => ` · ${describe(member())}`}
            </Describe>
            <Meters
              label="Requests the mock API answered"
              items={[
                { label: `GET ${API}`, value: () => counts.GET() },
                { label: `POST ${API}`, value: () => counts.POST() },
                { label: `DELETE ${API}/:id`, value: () => counts.DELETE() },
              ]}
            />
          </Stack>
        </DemoPanel>
        <DemoSurface aria-label="Posts table backed by the generated hooks">
          <Show when={() => alive()}>
            <QueryClientProvider client={client}>
              <PostsTable posts={posts} />
            </QueryClientProvider>
          </Show>
        </DemoSurface>
      </DemoGrid>
    </div>
  )
}

import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import queryManifest from '../manifest'

// Snapshot of the exact rendered llms.txt line + llms-full.txt section
// for @pyreon/query. Mirrors `packages/fundamentals/flow/src/tests/
// manifest-snapshot.test.ts` so a manifest edit surfaces as a failing
// inline snapshot locally (fast) in addition to the e2e `gen-docs
// --check` job that compares against the committed files.
//
// Update intentionally via `bun run test -- -u` after a deliberate
// manifest change.

describe('gen-docs — query snapshot', () => {
  it('renders @pyreon/query to its expected llms.txt bullet', () => {
    expect(renderLlmsTxtLine(queryManifest)).toMatchInlineSnapshot(`"- @pyreon/query — TanStack Query adapter with signal-driven results + WebSocket subscriptions + SSE (useSSE). \`useQuery\` / \`useInfiniteQuery\` / \`useQueries\` / \`useSuspenseQuery\` take options as a FUNCTION (not an object) so \`queryKey\` and other fields can read Pyreon signals. TanStack core uses an object; Pyreon wraps so changing a tracked signal re-runs the observer options and refetches automatically."`)
  })

  it('renders @pyreon/query to its expected llms-full.txt section — full body snapshot', () => {
    expect(renderLlmsFullSection(queryManifest)).toMatchInlineSnapshot(`
      "## @pyreon/query — TanStack Query Adapter

      Pyreon adapter for TanStack Query. Fine-grained signals per observer field (data, error, isFetching) so effects only re-run for the fields they read. Re-exports TanStack core (QueryClient, dehydrate/hydrate, etc.) so users import everything from \`@pyreon/query\`. Real-time hooks \`useSubscription\` (WebSocket, auto-reconnect, bidirectional) and \`useSSE\` (Server-Sent Events, read-only) share the QueryClient so cache invalidation from push updates is one line.

      \`\`\`typescript
      import {
        QueryClient,
        QueryClientProvider,
        useQuery,
        useMutation,
        useInfiniteQuery,
        useSubscription,
        useSSE,
        useSuspenseQuery,
        QuerySuspense,
      } from '@pyreon/query'

      // 1. Create a QueryClient and mount the provider at the app root.
      const client = new QueryClient()

      const App = () => (
        <QueryClientProvider client={client}>
          <Content />
        </QueryClientProvider>
      )

      // 2. useQuery — \`options\` is a function so it can read Pyreon signals.
      //    When the signal changes (e.g. a reactive queryKey), the observer
      //    updates and refetches automatically.
      const userId = signal(1)
      const user = useQuery(() => ({
        queryKey: ['user', userId()],
        queryFn: () => fetch(\`/api/users/\${userId()}\`).then((r) => r.json()),
      }))
      // user.data(), user.error(), user.isFetching() — each is its own signal,
      // so a template that reads only isFetching won't re-run when data changes.

      // 3. useMutation — reactive pending/success/error state + mutate/mutateAsync.
      const create = useMutation({
        mutationFn: (input: CreatePostInput) =>
          fetch('/api/posts', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.json()),
        onSuccess: () => client.invalidateQueries({ queryKey: ['posts'] }),
      })
      // <button onClick={() => create.mutate({ title: 'New' })}>Create</button>

      // 4. useSubscription — reactive WebSocket with auto-reconnect. The
      //    onMessage callback receives the QueryClient so push updates can
      //    invalidate or directly patch cached queries.
      const sub = useSubscription({
        url: 'wss://api.example.com/feed',
        onMessage: (event, queryClient) => {
          const payload = JSON.parse(event.data)
          if (payload.type === 'post-created') {
            queryClient.invalidateQueries({ queryKey: ['posts'] })
          }
        },
      })
      // sub.status() — 'connecting' | 'connected' | 'disconnected' | 'error'
      // sub.send(data), sub.close(), sub.reconnect()

      // 5. useSSE — same pattern as useSubscription but read-only (no send).
      //    \`parse\` deserializes per message; \`events\` filters named event types.
      const sse = useSSE({
        url: '/api/events',
        parse: JSON.parse,
        onMessage: (data, queryClient) => {
          if (data.type === 'order-updated') {
            queryClient.invalidateQueries({ queryKey: ['orders'] })
          }
        },
      })
      // sse.data() — last parsed message. sse.lastEventId() honours SSE \`id\` field.

      // 6. Suspense — useSuspenseQuery narrows \`data\` to Signal<TData> (never
      //    undefined). Pair with QuerySuspense to gate children on success.
      const profile = useSuspenseQuery(() => ({
        queryKey: ['profile', userId()],
        queryFn: fetchProfile,
      }))

      <QuerySuspense
        query={profile}
        fallback={<Spinner />}
        error={(err) => <ErrorCard message={String(err)} />}
      >
        {() => <ProfileCard name={profile.data().name} />}
      </QuerySuspense>

      // 7. useInfiniteQuery — reactive pages + fetchNextPage / fetchPreviousPage.
      const feed = useInfiniteQuery(() => ({
        queryKey: ['feed'],
        queryFn: ({ pageParam }) => fetchPage(pageParam),
        initialPageParam: 0,
        getNextPageParam: (last) => last.nextCursor,
      }))
      \`\`\`

      > **Options as a function**: \`useQuery\` / \`useInfiniteQuery\` / \`useQueries\` / \`useSuspenseQuery\` take options as a FUNCTION (not an object) so \`queryKey\` and other fields can read Pyreon signals. TanStack core uses an object; Pyreon wraps so changing a tracked signal re-runs the observer options and refetches automatically.
      >
      > **Signals all the way down**: \`result.data\`, \`.error\`, \`.isFetching\`, etc. are independent \`Signal<T>\` values — not plain properties. Call them (\`user.data()\`) to read, and each field-level read only subscribes to that field so templates re-render with maximum precision.
      >
      > **Real-time + cache**: \`useSubscription\` (WebSocket) and \`useSSE\` (Server-Sent Events) both hand their \`onMessage\` callback the active \`QueryClient\`. Invalidate or patch queries directly from push updates instead of duplicating server state in a parallel signal store.
      >
      > **Suspense data is non-undefined**: \`useSuspenseQuery\` narrows \`data: Signal<TData>\` (never undefined). Read it unconditionally inside \`QuerySuspense\` children — the boundary guarantees success before rendering. Outside the boundary, use \`useQuery\` and handle the undefined case.
      "
    `)
  })

  it('renders @pyreon/query to MCP api-reference entries — one per api[] item', () => {
    const record = renderApiReferenceEntries(queryManifest)
    const keys = Object.keys(record)
    expect(keys).toContain('query/QueryClientProvider')
    expect(keys).toContain('query/useQuery')
    expect(keys).toContain('query/useMutation')
    expect(keys).toContain('query/useInfiniteQuery')
    expect(keys).toContain('query/useQueries')
    expect(keys).toContain('query/useSubscription')
    expect(keys).toContain('query/useSSE')
    expect(keys).toContain('query/useSuspenseQuery')
    expect(keys).toContain('query/useSuspenseInfiniteQuery')
    expect(keys).toContain('query/QuerySuspense')
    expect(keys).toContain('query/useIsFetching')
    expect(keys).toContain('query/useIsMutating')
    expect(keys).toContain('query/QueryErrorResetBoundary')
    expect(keys).toContain('query/useQueryErrorResetBoundary')
    expect(keys).toContain('query/useQueryClient')
    expect(keys).toContain('query/TanStack core re-exports')
    expect(keys.length).toBe(16)

    // Spot-check flagship entry density
    const useQuery = record['query/useQuery']!
    expect(useQuery.mistakes?.split('\n').length).toBe(5)
    expect(useQuery.notes).toContain('fine-grained reactive signals')
    expect(useQuery.notes).toContain('FUNCTION')
    expect(useQuery.notes).toContain('See also:')

    // useSubscription carries WebSocket foot-guns
    const sub = record['query/useSubscription']!
    expect(sub.mistakes?.split('\n').length).toBe(3)
    expect(sub.notes).toContain('auto-reconnect')
    expect(sub.notes).toContain('QueryClient')

    // useMutation explains WHY options is a plain object
    const mut = record['query/useMutation']!
    expect(mut.mistakes?.split('\n').length).toBe(3)
    expect(mut.notes).toContain('plain OBJECT')
    expect(mut.notes).toContain('imperative')

    // useSuspenseInfiniteQuery carries boundary-requirement mistakes
    const suspInf = record['query/useSuspenseInfiniteQuery']!
    expect(suspInf.mistakes?.split('\n').length).toBe(2)
    expect(suspInf.mistakes).toContain('QuerySuspense')

    // useQueries warns about static arrays
    const queries = record['query/useQueries']!
    expect(queries.mistakes?.split('\n').length).toBe(2)
    expect(queries.mistakes).toContain('static array')
  })
})

import { onUnmount } from '@pyreon/core'
import { keepPreviousData, QueryClient, QueryClientProvider, useQuery } from '@pyreon/query'
import { effect, signal } from '@pyreon/reactivity'
import { DemoSurface } from '../kit/cards'
import { DemoGrid, DemoPanel, Meters, PaperButton, PaperHint, PaperLabel } from '../kit/demo'
import { DemoStack } from '../kit/demo-parts'

/**
 * Query demo (`query.json` → demo): one real `@pyreon/query` query, three
 * readers. Each reader is an effect that reads ONE field (`isFetching()`,
 * `data()`, `error()`) and counts its own runs, so the counters are what
 * actually re-ran. The fetcher is an in-page mock (about 600 ms): a
 * refetch that returns identical data keeps the same `data()` (structural
 * sharing), so its reader does not run.
 */
interface User {
  id: number
  name: string
}

const NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Edsger']
const LATENCY_MS = 600

function Readers() {
  const userId = signal(0)
  const requests = signal(0)
  // "Make the next fetch fail": the mock throws once, then serves again.
  let failNext = false

  const user = useQuery(() => ({
    queryKey: ['user', userId()],
    queryFn: async ({ queryKey }): Promise<User> => {
      requests.update((n) => n + 1)
      // pyreon-lint-disable-next-line pyreon/no-raw-setinterval
      await new Promise((r) => setTimeout(r, LATENCY_MS))
      if (failNext) {
        failNext = false
        throw new Error('Error 500')
      }
      const id = queryKey[1] as number
      return { id, name: NAMES[id % NAMES.length] as string }
    },
    // Keep showing the previous user while the next one loads.
    placeholderData: keepPreviousData,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  }))

  // Three readers, one field each. A reader re-runs only when its field changes.
  const runs = { fetching: signal(0), data: signal(0), error: signal(0) }
  effect(() => {
    user.isFetching()
    runs.fetching.update((n) => n + 1)
  })
  effect(() => {
    user.data()
    runs.data.update((n) => n + 1)
  })
  effect(() => {
    user.error()
    runs.error.update((n) => n + 1)
  })

  return (
    <DemoGrid>
      <DemoPanel note="Counters are effect runs, read from the effects themselves. The network is an in-page mock with about 600 ms per request.">
        <Meters
          label="Reader runs"
          items={[
            { label: <>reads isFetching() · {() => String(user.isFetching())}</>, value: () => runs.fetching() },
            { label: <>reads data() · {() => user.data()?.name ?? 'undefined'}</>, value: () => runs.data() },
            { label: <>reads error() · {() => user.error()?.message ?? 'null'}</>, value: () => runs.error() },
          ]}
        />
      </DemoPanel>
      <DemoSurface aria-label="Query actions">
        <PaperLabel>Actions</PaperLabel>
        <DemoStack>
          <PaperButton type="button" onClick={() => userId.update((n) => n + 1)}>
            Next user (userId.set)
          </PaperButton>
          <PaperButton type="button" onClick={() => void user.refetch()}>
            Refetch, same data
          </PaperButton>
          <PaperButton
            type="button"
            onClick={() => {
              failNext = true
              void user.refetch()
            }}
          >
            Make the next fetch fail
          </PaperButton>
        </DemoStack>
        <PaperHint aria-live="polite">{() => (user.isFetching() ? 'Fetching…' : `${requests()} request${requests() === 1 ? '' : 's'} sent`)}</PaperHint>
      </DemoSurface>
    </DemoGrid>
  )
}

export default function DemoQuery() {
  const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })
  onUnmount(() => client.clear())
  return (
    <QueryClientProvider client={client}>
      <Readers />
    </QueryClientProvider>
  )
}

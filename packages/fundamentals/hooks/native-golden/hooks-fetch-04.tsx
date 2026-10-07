import { signal } from '@pyreon/reactivity'
import { onMount } from '@pyreon/core'
import { useFetch, useInterval, useOnline } from '@pyreon/hooks'
import { useQuery } from '@pyreon/query'
import { Suspense, ErrorBoundary, Stack, Text } from '@pyreon/primitives'

type User = { id: number; name: string }

// A query declared BEFORE a fetch, over Suspense and ErrorBoundary, with mount effects, a timer and a service lifecycle:
// the order the conditions and the modifiers come out in is part of the output.
export function Mixed() {
  const count = signal(0)
  const q = useQuery<User>(() => ({ queryKey: ['u'], queryFn: () => fetch('/api/q').then((r) => r.json()) }))
  const f = useFetch<User>('/api/f')
  const net = useOnline()
  useInterval(() => count.set(count() + 1), 1000)
  onMount(() => { count.set(1) })
  const g = useFetch<User[]>('/api/g')
  return (
    <ErrorBoundary fallback={<Text>failed</Text>}>
      <Suspense fallback={<Text>loading</Text>}>
        <Stack><Text>{String(q.data()) + String(f.data()) + String(g.data()) + String(net())}</Text></Stack>
      </Suspense>
    </ErrorBoundary>
  )
}

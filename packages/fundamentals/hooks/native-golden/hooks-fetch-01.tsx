import { useFetch } from '@pyreon/hooks'
import { Suspense, ErrorBoundary, Stack, Text, Show } from '@pyreon/primitives'

type User = { id: number; name: string }

// Suspense and ErrorBoundary over fetches, a nullable payload (not wrapped in a second optional), and reads of every member.
export function Profile() {
  const user = useFetch<User>('/api/user')
  const maybe = useFetch<User | null>('/api/maybe')
  const list = useFetch<User[]>('/api/users')
  return (
    <Stack>
      <ErrorBoundary fallback={<Text>failed</Text>}>
        <Suspense fallback={<Text>loading</Text>}>
          <Text>{user.data()?.name ?? 'none'}</Text>
        </Suspense>
      </ErrorBoundary>
      <Show when={maybe.isPending()}><Text>pending</Text></Show>
      <Text>{maybe.data()?.name ?? 'nobody'}</Text>
      <Text>{String(list.data()?.length ?? 0)}</Text>
      <Text>{user.error() ? 'bad' : 'ok'}</Text>
    </Stack>
  )
}

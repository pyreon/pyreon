// A literal `use` array that lowers: bearer (inside retry, so the token is read per attempt), retry with non-default
// options, and a production logger, applied by both useFetch and useQuery.
import { createHttp } from '@pyreon/http'
import { bearer, logger, retry } from '@pyreon/http/middleware'
import { useFetch } from '@pyreon/hooks'
import { useQuery } from '@pyreon/query'
import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'

interface Todo {
  id: number
  title: string
}

const useSession = defineStore('session', () => {
  const token = signal('')
  return { token }
})

const api = createHttp({
  baseUrl: 'https://api.example.com',
  use: [
    retry({ limit: 4, statuses: [429, 503], maxDelay: 10000 }),
    bearer(() => useSession().store.token()),
    logger({ production: true }),
  ],
})
const getTodo = api.endpoint('GET /todos/:id')

export function TodoView(props: { id: number }) {
  const first = useFetch<Todo>(getTodo({ params: { id: 1 } }))
  const live = useQuery<Todo>(() => getTodo.query({ params: { id: props.id } }))
  return (
    <Stack>
      <Text>{first.data()?.title ?? ''}</Text>
      <Text>{live.data()?.title ?? ''}</Text>
    </Stack>
  )
}

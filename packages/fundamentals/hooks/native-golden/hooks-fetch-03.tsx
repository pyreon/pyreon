import { useFetch } from '@pyreon/hooks'
import { createHttp } from '@pyreon/http'
import { Stack, Text } from '@pyreon/primitives'

type User = { id: number; name: string }
const URL = '/api/const'
const api = createHttp({ baseUrl: 'https://example.test' })
const getUser = api.endpoint('GET /users/:id')

// Url shapes: a module-scope const, a template, a missing url, a missing response type, a same-file endpoint, and a destructure.
export function Urls(props: { id: string }) {
  const fromConst = useFetch<User>(URL)
  const dynamic = useFetch<User>(`/api/${props.id}`)
  const noUrl = useFetch<User>()
  const untyped = useFetch('/api/untyped')
  const endpoint = useFetch<User>(getUser({ params: { id: '1' } }))
  const { data, isPending } = useFetch<User>('/api/destructured')
  return <Stack><Text>{String(fromConst.data()) + String(dynamic.data()) + String(noUrl.data()) + String(untyped.data()) + String(endpoint.data()) + String(data) + String(isPending)}</Text></Stack>
}

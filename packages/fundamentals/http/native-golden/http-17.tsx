import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const ep = api.endpoint('GET /users/:id')
export function S() {
  const key = 'id'
  const u = useFetch<User>(ep({ params: { [key]: '1' } }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}

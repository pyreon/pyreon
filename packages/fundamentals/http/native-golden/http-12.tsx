
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const OPTS = { retry: 1 }
const ep = api.endpoint('GET /users', OPTS)
export function S() {
  const u = useFetch<User>(ep())
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}

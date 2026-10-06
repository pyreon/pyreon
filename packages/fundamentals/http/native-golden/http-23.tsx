
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: string }
const api = createHttp({ baseUrl: compute() })
const ep = api.endpoint('GET /users')
export function S() {
  const u = useFetch<User>(ep())
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}

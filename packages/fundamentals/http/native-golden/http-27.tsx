
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const ep = api.endpoint('GET /u/:id')
export function S() {
  const u = useFetch<User>(ep({ params: { id: runtime } }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}


import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const ep = api.endpoint('POST /users')
export function S() {
  const u = useFetch<User>(ep({ headers: HH }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}

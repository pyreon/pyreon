
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const opts = { json: { a: 1 } }
const createUser = api.endpoint('POST /users')
export function S() {
  const u = useFetch<User>(createUser({ ...opts }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}

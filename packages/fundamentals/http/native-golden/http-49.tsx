
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const createUser = api.endpoint('POST /users')
export function S() {
  const u = useFetch<User>(createUser({ timeout: 5000 }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}

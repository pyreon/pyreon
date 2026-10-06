
import { createHttp } from '@pyreon/http'
import { useQuery } from '@pyreon/query'
import { Text } from '@pyreon/primitives'
interface L { message: string }
const api = createHttp({ baseUrl: 'https://api.example.com' })
const tail = api.endpoint('GET /tail', { responseType: 'stream' })
export function C() {
  const q = useQuery<L>(() => tail.query())
  return <Text>{q.data()?.message ?? ''}</Text>
}

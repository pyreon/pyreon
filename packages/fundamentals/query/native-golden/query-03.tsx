import { createHttp } from '@pyreon/http'
import { openEventStream, type SseEvent } from '@pyreon/http/stream'
import { useFetch } from '@pyreon/hooks'
import { useStream } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: number; name: string }
const api = createHttp({ baseUrl: 'https://api.example.com' })
const getUser = api.endpoint('GET /users/:id')
const feed = api.endpoint('GET /users/:id/feed', { responseType: 'stream' })
export function C() {
  const req = useFetch<User>(getUser({ params: { id: '1' } }))
  const live = useStream<SseEvent<User>>((ctx) => openEventStream((c) => feed({ params: { id: '1' }, signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }))
  return (<Stack><Text>{req.data}</Text><Text>{live.latest()?.data.name ?? ''}</Text></Stack>)
}

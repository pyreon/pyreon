
import { createHttp } from '@pyreon/http'
import { openEventStream, openNdjsonStream, type SseEvent } from '@pyreon/http/stream'
import { useStream } from '@pyreon/query'
import { Stack, Text, Button } from '@pyreon/primitives'
interface LogLine { message: string; level: string }
const api = createHttp({ baseUrl: 'https://api.example.com' })
const tail = api.endpoint('GET /logs/:room/tail', { responseType: 'stream' })
const complete = api.endpoint('POST /complete', { responseType: 'stream' })
const rows = api.endpoint('GET /export', { responseType: 'stream' })
const handler = (e: unknown) => e
export function Feed(props: { room: string }) {
  
  const s = useStream<SseEvent<LogLine>>((ctx) => openEventStream((c) => tail({ params: { room: props.room }, signal: c.signal, headers: c.headers }), { signal: ctx.signal }), { onEvent: handler })
  return <Text>{s.status()}</Text>
}

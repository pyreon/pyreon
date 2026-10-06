
import { createHttp } from '@pyreon/http'
import { openEventStream, openNdjsonStream, type SseEvent } from '@pyreon/http/stream'
import { useStream } from '@pyreon/query'
import { Stack, Text, Button } from '@pyreon/primitives'
interface LogLine { message: string; level: string }
const api = createHttp({ baseUrl: 'https://api.example.com' })
const tail = api.endpoint('GET /logs/:room/tail', { responseType: 'stream' })
const complete = api.endpoint('POST /complete', { responseType: 'stream' })
const rows = api.endpoint('GET /export', { responseType: 'stream' })

export function Feed(props: { room: string }) {
  
  const s = useStream((ctx) =>
    openEventStream((c) => complete({ json: { prompt: 'hi' }, signal: c.signal, headers: c.headers }), {
      data: 'text',
      reconnect: false,
      signal: ctx.signal,
      onStatus: ctx.onStatus,
    }),
  )
  return <Stack><Text>{s.latest()?.data ?? ''}</Text></Stack>
}

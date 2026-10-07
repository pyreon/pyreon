
import { createHttp } from '@pyreon/http'
import { openEventStream, openNdjsonStream, type SseEvent } from '@pyreon/http/stream'
import { useStream } from '@pyreon/query'
import { Stack, Text, Button } from '@pyreon/primitives'
interface LogLine { message: string; level: string }
const api = createHttp({ baseUrl: 'https://api.example.com' })
const tail = api.endpoint('GET /logs/:room/tail', { responseType: 'stream' })
const complete = api.endpoint('POST /complete', { responseType: 'stream' })
const rows = api.endpoint('GET /export', { responseType: 'stream' })
import { signal } from '@pyreon/reactivity'
export function Feed(props: { room: string }) {
  
  const last = signal('')
  const s = useStream<LogLine>(
    (ctx) => openNdjsonStream((c) => rows({ signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }),
    { enabled: false, onEvent: (row, _qc) => last.set(row.level) },
  )
  return <Stack><Text>{last()}</Text><Text>{s.status()}</Text></Stack>
}

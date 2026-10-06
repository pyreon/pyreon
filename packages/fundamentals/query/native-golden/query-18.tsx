
import { createHttp } from '@pyreon/http'
import { openEventStream, type SseEvent } from '@pyreon/http/stream'
import { useStream } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
interface Tok { t: string }
const api = createHttp({ baseUrl: 'https://api.example.com' })
const chat = api.endpoint('POST /chat', { responseType: 'stream' })
export function App() {
  const q = signal('hi')
  const s = useStream<SseEvent<Tok>>((ctx) =>
    openEventStream((c) => chat({ json: { zeta: q(), alpha: 2 }, signal: c.signal, headers: c.headers }), {
      signal: ctx.signal,
      onStatus: ctx.onStatus,
    }),
  )
  return (<Stack><Text>{s.status()}</Text></Stack>)
}

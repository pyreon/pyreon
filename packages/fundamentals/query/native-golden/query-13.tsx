
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
  
  const go = signal(false)
  const prompt = signal('hi')
  const seen = signal(0)
  const s = useStream<SseEvent<LogLine>>(
    (ctx) =>
      openEventStream((c) => complete({ json: { prompt: prompt() }, signal: c.signal, headers: c.headers }), {
        signal: ctx.signal,
        onStatus: ctx.onStatus,
      }),
    { enabled: () => go(), onEvent: (ev) => { seen.set(seen() + ev.data.message.length) } },
  )
  return (
    <Stack>
      <Text>{s.status()}</Text>
      <Text>{`${seen()}`}</Text>
      <Button onPress={() => go.set(true)}>send</Button>
    </Stack>
  )
}

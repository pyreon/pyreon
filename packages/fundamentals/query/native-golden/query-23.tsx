
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
  
  const s = useStream<SseEvent<LogLine>>((ctx) =>
    openEventStream((c) => tail({ params: { room: props.room }, signal: c.signal, headers: c.headers }), {
      signal: ctx.signal,
      onStatus: ctx.onStatus,
      events: ['log'],
      lastEventId: '42',
    }),
    { maxEvents: 200 },
  )
  return (
    <Stack>
      <Text>{s.status()}</Text>
      <Text>{s.latest()?.data.message ?? ''}</Text>
      <Text>{`${s.events().length}`}</Text>
      <Button onPress={() => s.restart()}>again</Button>
      <Button onPress={() => s.abort()}>stop</Button>
    </Stack>
  )
}

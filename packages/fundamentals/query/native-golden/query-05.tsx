
import { createHttp } from '@pyreon/http'
import { openEventStream, type SseEvent } from '@pyreon/http/stream'
import { useStream } from '@pyreon/query'
const api = createHttp({ baseUrl: 'https://api.example.com' })
export type CompleteRequest = { prompt: string; maxTokens?: number | undefined }
export type Token = { text: string }
export const complete = api.endpoint('POST /rooms/:room/complete', { responseType: 'stream' })
export function CompleteStream(props: { room: string; enabled: boolean; json: CompleteRequest; children: (events: readonly SseEvent<Token>[]) => unknown }) {
  const s = useStream<SseEvent<Token>>(
    (ctx) => openEventStream((c) => complete({ params: { room: props.room }, json: props.json, signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }),
    { enabled: () => props.enabled },
  )
  return () => props.children(s.events())
}

import { createHttp, type HttpMiddleware } from '@pyreon/http'
import { retry } from '@pyreon/http/middleware'
import { createMock } from '@pyreon/http/mock'
import { standardSchema } from '@pyreon/http/schema'
import { signal } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
import { GlowCard } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { Pill } from '../kit/controls'
import { DemoGrid } from '../kit/demo'
import { CardSegmented, createLog, DemoLog, DemoStack, SimulatedNote } from '../kit/demo-parts'
import { Eyebrow } from '../kit/type'

/**
 * HTTP demo (`http.json` → demo): the real `createHttp` with `retry()` and a
 * `User` response schema, calling a typed endpoint. The "server" is
 * `@pyreon/http/mock` (a middleware that answers without the network), so
 * nothing leaves the page. Each server mode is a mock; a small middleware
 * between `retry()` and the mock logs every attempt, and the retry backoff
 * logs its own wait.
 */
const MODES = ['ok', 'fails once', '503 always', 'hangs', 'wrong shape'] as const
type Mode = (typeof MODES)[number]

const TIMEOUT_MS = 3000
const LATENCY = 450

const User = s.object({ id: s.string(), name: s.string() })

const route = { path: '/users/1', delay: LATENCY }
const ok = createMock([{ ...route, json: { id: '1', name: 'Ada' } }]).middleware
const down = createMock([{ ...route, status: 503, json: { error: 'Service Unavailable' } }]).middleware
// Abort-aware latency far past the timeout: the client's timeout ends it.
const hang = createMock([{ ...route, delay: 60_000, json: { id: '1', name: 'Ada' } }]).middleware
const wrong = createMock([{ ...route, json: { id: 7 } }]).middleware

export default function DemoHttp() {
  const mode = signal<Mode>('ok')
  const busy = signal(false)
  const log = createLog(60)
  let attempt = 0
  let started = 0
  const at = () => `${String(Math.round(performance.now() - started)).padStart(5, ' ')} ms`

  // The in-page server: picks the mock for the current mode, per attempt.
  const server: HttpMiddleware = (request, next) => {
    attempt++
    log.push(`${at()}  attempt ${attempt} → GET ${new URL(request.url, 'http://x').pathname}`)
    const m = mode.peek()
    const handler = m === 'ok' ? ok : m === 'hangs' ? hang : m === 'wrong shape' ? wrong : m === 'fails once' && attempt > 1 ? ok : down
    return handler(request, next).then((res) => {
      log.push(`${at()}  ← ${res.status}${res.status >= 500 ? ' Service Unavailable' : ' OK'}`, res.status >= 500 ? 'err' : 'dim')
      return res
    })
  }

  const api = createHttp({
    baseUrl: '/api',
    schema: standardSchema,
    timeout: TIMEOUT_MS,
    use: [
      retry({
        limit: 2,
        backoff: (n) => {
          const wait = 300 * 2 ** (n - 1)
          log.push(`${at()}  retry: waiting ${wait} ms before attempt ${n + 1}`, 'accent')
          return wait
        },
      }),
      server,
    ],
  })
  const getUser = api.endpoint('GET /users/:id', { response: User })

  const send = async () => {
    if (busy.peek()) return
    busy.set(true)
    log.clear()
    attempt = 0
    started = performance.now()
    log.push(`getUser({ params: { id: '1' } })  · server: ${mode.peek()}`)
    try {
      const user = await getUser({ params: { id: '1' } })
      log.push(`${at()}  ✓ typed User: ${JSON.stringify(user)}`, 'ok')
    } catch (e) {
      const err = e as Error
      log.push(`${at()}  ✕ ${err.name}: ${err.message}`, 'err')
    } finally {
      busy.set(false)
    }
  }

  return (
    <DemoGrid>
      <GlowCard padding="compact">
        <DemoStack>
          <Eyebrow>server</Eyebrow>
          <CardSegmented label="Mock server behaviour" options={MODES} value={() => mode()} onChange={(v) => mode.set(v)} />
          <div>
            <Pill variant="solid" onClick={() => void send()}>
              {() => (busy() ? 'sending…' : "getUser({ params: { id: '1' } })")}
            </Pill>
          </div>
          <CodeBlock
            label="The client"
            code={`const api = createHttp({\n  schema: standardSchema,\n  timeout: ${TIMEOUT_MS},  // default 30 s, shortened here\n  use: [retry({ limit: 2 }), mock],\n})\nconst getUser = api.endpoint(\n  'GET /users/:id', { response: User })`}
          />
          <SimulatedNote>The server is @pyreon/http/mock, in this page: no network. The timeout is lowered to 3 s so a hang ends quickly.</SimulatedNote>
        </DemoStack>
      </GlowCard>
      <GlowCard padding="compact">
        <DemoStack>
          <Eyebrow>request log</Eyebrow>
          <DemoLog label="Request log" entries={() => log.entries()} empty="Pick a server behaviour and send the request." />
        </DemoStack>
      </GlowCard>
    </DemoGrid>
  )
}

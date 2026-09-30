import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { KOTLIN_COMPOSE_STUBS } from '../kotlin-stubs'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

/**
 * `useStream` over `@pyreon/http/stream` — SSE and NDJSON — lowers to the
 * native stream runtime (`PyreonStream`, co-located in `@pyreon/http/native`).
 *
 * Before this, both hooks named "has NO native lowering" and a generated
 * client reported every stream-only operation `web-only`. The runtime's WIRE
 * parity with the web is proven by execution in
 * `native-stream-parser-parity.test.ts`; this file locks the LOWERING: what
 * the emit calls, that it compiles against the stubs AND the real runtime
 * source, and that every shape it cannot honour says so by name.
 */

const swift = (s: string) => transform(s, { target: 'swift' })
const kotlin = (s: string) => transform(s, { target: 'kotlin' })

const app = (body: string, extra = ''): string => `
import { createHttp } from '@pyreon/http'
import { openEventStream, openNdjsonStream, type SseEvent } from '@pyreon/http/stream'
import { useStream } from '@pyreon/query'
import { Stack, Text, Button } from '@pyreon/primitives'
interface LogLine { message: string; level: string }
const api = createHttp({ baseUrl: 'https://api.example.com' })
const tail = api.endpoint('GET /logs/:room/tail', { responseType: 'stream' })
const complete = api.endpoint('POST /complete', { responseType: 'stream' })
const rows = api.endpoint('GET /export', { responseType: 'stream' })
${extra}
export function Feed(props: { room: string }) {
  ${body}
}
`

const SSE = app(`
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
      <Text>{\`\${s.events().length}\`}</Text>
      <Button onPress={() => s.restart()}>again</Button>
      <Button onPress={() => s.abort()}>stop</Button>
    </Stack>
  )`)

const TEXT = app(`
  const s = useStream((ctx) =>
    openEventStream((c) => complete({ json: { prompt: 'hi' }, signal: c.signal, headers: c.headers }), {
      data: 'text',
      reconnect: false,
      signal: ctx.signal,
      onStatus: ctx.onStatus,
    }),
  )
  return <Stack><Text>{s.latest()?.data ?? ''}</Text></Stack>`)

const NDJSON = app(`
  const s = useStream<LogLine>((ctx) =>
    openNdjsonStream((c) => rows({ query: { since: 5 }, signal: c.signal, headers: c.headers }), {
      signal: ctx.signal,
      onStatus: ctx.onStatus,
    }),
  )
  return <Stack><Text>{s.latest()?.message ?? ''}</Text></Stack>`)

/**
 * `enabled` + `onEvent` + a RUNTIME json body, together: the explicitly
 * triggered POST stream (an LLM prompt sent when the user presses Send). The
 * web reads `enabled` and the source TRACKED, so a flip or a new prompt
 * re-opens the stream; natively both are part of the harness key.
 */
const GATED = app(
  `
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
      <Text>{\`\${seen()}\`}</Text>
      <Button onPress={() => go.set(true)}>send</Button>
    </Stack>
  )`,
  `import { signal } from '@pyreon/reactivity'`,
)

/** NDJSON with `onEvent` taking the (unused) QueryClient parameter too. */
const NDJSON_ON_EVENT = app(
  `
  const last = signal('')
  const s = useStream<LogLine>(
    (ctx) => openNdjsonStream((c) => rows({ signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }),
    { enabled: false, onEvent: (row, _qc) => last.set(row.level) },
  )
  return <Stack><Text>{last()}</Text><Text>{s.status()}</Text></Stack>`,
  `import { signal } from '@pyreon/reactivity'`,
)

/**
 * The shape @pyreon/lathe GENERATES for a non-GET stream (its
 * native-triggered-streams test): a component whose PROPS carry the trigger
 * and a named JSON body. Kept here so the real-runtime compile below covers
 * it — lathe cannot reach the compiler's Kotlin stub surface.
 */
const TRIGGERED = `
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
`

describe('useStream lowers to the native stream runtime', () => {
  for (const [label, src] of [
    ['SSE (typed, filtered, resumed, runtime :param)', SSE],
    ['SSE text over POST', TEXT],
    ['NDJSON', NDJSON],
    ['gated POST with onEvent + runtime body', GATED],
    ['NDJSON with onEvent + literal enabled', NDJSON_ON_EVENT],
    ['a Lathe-shaped triggered POST (props enabled + json)', TRIGGERED],
  ] as const) {
    it(`${label}: zero warnings on both targets`, () => {
      expect(swift(src).warnings).toEqual([])
      expect(kotlin(src).warnings).toEqual([])
    })
  }

  it('Swift: a PyreonStream keyed on the runtime URL + restart tick', () => {
    const code = swift(SSE).code
    expect(code).toContain('@State private var s = PyreonStream<PyreonSseEvent<LogLine>>(maxEvents: 200)')
    // Keyed on the interpolated URL, so a new room REOPENS the stream.
    expect(code).toContain(
      '.task(id: "\\("https://api.example.com/logs/\\(PyreonURL.encodePathParam(room))/tail")#\\(s.restartTick)")',
    )
    expect(code).toContain('options: PyreonSseOptions(events: ["log"], lastEventId: "42", reconnect: PyreonStreamReconnect(attempts: 5, delay: 1000, maxDelay: 30000, onEnd: false))')
    expect(code).toContain('decode: PyreonStreamDecode.sseJSON(LogLine.self)')
    // Result reads are properties; abort/restart stay calls.
    expect(code).toContain('s.status')
    expect(code).not.toContain('s.status()')
    expect(code).toContain('s.restart()')
    // A `.task` needs a stable-identity host (device-found; see the ZStack note).
    expect(code).toContain('ZStack {')
  })

  it('Kotlin: a DisposableEffect keyed on the runtime URL + restart tick, stopped on dispose', () => {
    const code = kotlin(SSE).code
    expect(code).toContain('val s = remember { PyreonStream<PyreonSseEvent<LogLine>>(maxEvents = 200L, main = PyreonStreamMain) }')
    expect(code).toContain(
      'DisposableEffect("${"https://api.example.com/logs/${PyreonURL.encodePathParam(room)}/tail"}#${s.restartTick.value}")',
    )
    expect(code).toContain('PyreonSseEvent(m.type, PyreonFetchJson.decodeFromString<LogLine>(m.data), m.id)')
    expect(code).toContain('onDispose { s.stop() }')
    expect(code).toContain('s.status.value')
  })

  it('POST with a json body, text payloads, no reconnect', () => {
    const s = swift(TEXT).code
    expect(s).toContain('PyreonStream<PyreonSseEvent<String>>')
    expect(s).toContain('method: "POST"')
    expect(s).toContain('body: Data("{\\"prompt\\":\\"hi\\"}".utf8)')
    expect(s).toContain('reconnect: nil')
    expect(s).toContain('decode: PyreonStreamDecode.sseText()')
    const k = kotlin(TEXT).code
    expect(k).toContain('reconnect = null')
    expect(k).toContain('PyreonSseEvent(m.type, m.data, m.id)')
  })

  it('NDJSON decodes each line into the item type', () => {
    expect(swift(NDJSON).code).toContain(
      'await s.runNdjson(PyreonStreamRequest(method: "GET", url: "https://api.example.com/export?since=5"), decode: PyreonStreamDecode.ndjson(LogLine.self))',
    )
    expect(kotlin(NDJSON).code).toContain(
      's.startNdjson(PyreonStreamRequest(method = "GET", url = "https://api.example.com/export?since=5")) { line -> PyreonFetchJson.decodeFromString<LogLine>(line) }',
    )
  })

  it('`enabled` gates the run and is part of the key; false reads idle', () => {
    const sw = swift(GATED).code
    expect(sw).toContain('#\\(s.restartTick)#\\(go)#\\(')
    expect(sw).toContain('        if go {')
    expect(sw).toContain('          s.idle()')
    const kt = kotlin(GATED).code
    expect(kt).toContain('#${s.restartTick.value}#${go}#${')
    expect(kt).toContain('    if (go) {')
    expect(kt).toContain('      s.idle()')
    // A bare signal is read like the accessor — the web calls it either way.
    const bare = GATED.replace('enabled: () => go()', 'enabled: go')
    expect(swift(bare).code).toBe(sw)
    expect(kotlin(bare).code).toBe(kt)
  })

  it('`onEvent` runs after each event, with the event typed as the stream item', () => {
    expect(swift(GATED).code).toContain('onEvent: { ev in seen = seen + ev.data.message.utf16.count }, decode:')
    expect(kotlin(GATED).code).toContain('onEvent = { ev -> seen = seen + ev.data.message.length }) { m ->')
    expect(swift(NDJSON_ON_EVENT).code).toContain('onEvent: { row in last = row.level }, decode: PyreonStreamDecode.ndjson(LogLine.self)')
    expect(kotlin(NDJSON_ON_EVENT).code).toContain('onEvent = { row -> last = row.level }) { line ->')
  })

  it('a RUNTIME json body is serialized per run, keyed, and sends content-type', () => {
    const sw = swift(GATED).code
    expect(sw).toContain('struct __Obj0: Codable')
    expect(sw).toContain('body: Data(PyreonJSON.stringify(__Obj0(prompt: prompt)).utf8)')
    expect(sw).toContain('headers: ["content-type": "application/json"]')
    const kt = kotlin(GATED).code
    expect(kt).toContain('body = PyreonJson.stringify(__Obj0(prompt = prompt))')
    expect(kt).toContain('#${PyreonJson.stringify(__Obj0(prompt = prompt))}")')
  })

  it('a plain stream\'s harness is unchanged by the new options (no gate, no callback)', () => {
    const sw = swift(SSE).code
    expect(sw).not.toContain('idle()')
    expect(sw).not.toContain('onEvent')
    expect(kotlin(SSE).code).not.toContain('idle()')
  })

  it('a non-default Accept (`{ ...c.headers, accept }`) lowers as the stream\'s Accept', () => {
    const src = NDJSON.replace('headers: c.headers', "headers: { ...c.headers, accept: 'application/jsonl' }")
    const sw = swift(src)
    const kt = kotlin(src)
    expect(sw.warnings).toEqual([])
    expect(kt.warnings).toEqual([])
    expect(sw.code).toContain(', accept: "application/jsonl", decode:')
    expect(kt.code).toContain(', accept = "application/jsonl") {')
    // The literal is the stream's Accept, not a second request header.
    expect(sw.code).not.toContain('headers: ["accept"')
  })

  for (const [label, src] of [
    ['SSE', SSE],
    ['text', TEXT],
    ['NDJSON', NDJSON],
    ['gated', GATED],
    ['NDJSON onEvent', NDJSON_ON_EVENT],
  ] as const) {
    it.skipIf(!isSwiftcAvailable())(`${label}: swiftc accepts the emit (stubs)`, () => {
      const res = validateSwiftWithStubs(swift(src).code)
      expect(res.error ?? '').toBe('')
      expect(res.ok).toBe(true)
    })
    it.skipIf(!isKotlincAvailable())(`${label}: kotlinc accepts the emit (stubs)`, () => {
      const res = validateKotlin(kotlin(src).code)
      expect(res.error ?? '').toBe('')
      expect(res.ok).toBe(true)
    })
  }
})

/**
 * The stub gates above can only prove the emit agrees with the STUB. These
 * compile it against the file that SHIPS — the class `emitted-runtime-types-
 * exist` / `real-runtime-typecheck` exist for (`<Audio>` passed every stub gate
 * referencing types that existed nowhere else).
 */
describe('useStream emit compiles against the REAL runtime source', () => {
  const RUNTIME_SWIFT = join(__dirname, '../../../../fundamentals/http/native/swift/PyreonStream.swift')
  const RUNTIME_KOTLIN = join(
    __dirname,
    '../../../../fundamentals/http/native/kotlin/com/pyreon/runtime/PyreonStream.kt',
  )

  it.skipIf(!isSwiftUIAvailable())('Swift: real SDK + real PyreonStream.swift', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-stream-real-swift-'))
    try {
      const files = [SSE, TEXT, NDJSON, GATED, NDJSON_ON_EVENT, TRIGGERED].map((src, i) => {
        // One module: rename the shared names apart.
        const code = swift(src).code.replace(/\bFeed\b/g, `Feed${i}`).replace(/\bLogLine\b/g, `LogLine${i}`)
        const p = join(dir, `App${i}.swift`)
        writeFileSync(p, `import SwiftUI\nimport Foundation\n${code}`)
        return p
      })
      // PyreonURL lives in the core runtime; the stream emit's runtime :param uses it.
      const core = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonHttp.swift')
      // The runtime json body goes through PyreonJSON.stringify.
      const json = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonJSON.swift')
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
      execFileSync(
        'xcrun',
        ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk, ...files, RUNTIME_SWIFT, core, json],
        { stdio: 'pipe', encoding: 'utf8' },
      )
    } catch (err) {
      const e = err as { stderr?: string }
      expect.fail(`swiftc failed against the real runtime:\n${(e.stderr ?? String(err)).split('\n').filter((l) => l.includes('error:')).slice(0, 10).join('\n')}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)

  it.skipIf(!isKotlincAvailable())('Kotlin: real PyreonStream.kt in place of its stub', () => {
    // The stub block is REPLACED by the shipped file (package / imports
    // stripped into the stubs' default package), so a signature the stub
    // got wrong fails here even though every stub gate passes.
    const start = KOTLIN_COMPOSE_STUBS.indexOf('// PyreonStream — mirror of')
    const end = KOTLIN_COMPOSE_STUBS.indexOf('// PyreonHttp — what a', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const stubs = KOTLIN_COMPOSE_STUBS.slice(0, start) + KOTLIN_COMPOSE_STUBS.slice(end)
    const runtime = readFileSync(RUNTIME_KOTLIN, 'utf8')
      .replace(/^package .*$/m, '')
      .replace(/^import androidx\.compose\.runtime\..*$/gm, '')
    // The emit hands the container `PyreonStreamMain`, which lives beside it in
    // PyreonStreamAndroid.kt — real too, against a two-type `android.os` mirror.
    const android = readFileSync(RUNTIME_KOTLIN.replace('PyreonStream.kt', 'PyreonStreamAndroid.kt'), 'utf8').replace(
      /^package .*$/m,
      '',
    )
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-stream-real-kotlin-'))
    try {
      writeFileSync(join(dir, 'Stubs.kt'), stubs)
      writeFileSync(join(dir, 'PyreonStream.kt'), runtime)
      writeFileSync(join(dir, 'PyreonStreamAndroid.kt'), android)
      writeFileSync(
        join(dir, 'AndroidOs.kt'),
        'package android.os\nclass Looper { companion object { fun getMainLooper(): Looper = Looper() } }\nclass Handler(looper: Looper) { fun post(r: Runnable): Boolean = true }\n',
      )
      const inputs = [SSE, TEXT, NDJSON, GATED, NDJSON_ON_EVENT, TRIGGERED].map((src, i) => {
        const code = kotlin(src).code.replace(/\bFeed\b/g, `Feed${i}`).replace(/\bLogLine\b/g, `LogLine${i}`)
        const p = join(dir, `App${i}.kt`)
        writeFileSync(p, code)
        return p
      })
      execFileSync('kotlinc', ['-nowarn', '-d', join(dir, 'out'), join(dir, 'Stubs.kt'), join(dir, 'PyreonStream.kt'), join(dir, 'PyreonStreamAndroid.kt'), join(dir, 'AndroidOs.kt'), ...inputs], {
        stdio: 'pipe',
        encoding: 'utf8',
      })
    } catch (err) {
      const e = err as { stderr?: string }
      expect.fail(`kotlinc failed against the real runtime:\n${(e.stderr ?? String(err)).split('\n').filter((l) => l.includes('error:')).slice(0, 10).join('\n')}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)
})

describe('useStream — every shape that cannot lower says so', () => {
  it('an untyped stream bails by name (there is nothing to decode into)', () => {
    const r = swift(
      app(`
  const s = useStream((ctx) => openEventStream((c) => tail({ params: { room: props.room }, signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }))
  return <Text>{s.status()}</Text>`),
    )
    expect(r.warnings.some((w) => w.includes('useStream needs the event payload type'))).toBe(true)
  })

  it('a fetch transport bails by name', () => {
    const r = kotlin(
      app(`
  const s = useStream<SseEvent<LogLine>>((ctx) => openEventStream(async (c) => (await fetch('/x', { signal: c.signal })).body, { signal: ctx.signal }))
  return <Text>{s.status()}</Text>`),
    )
    expect(r.warnings.some((w) => w.includes('connects through a same-file `@pyreon/http` endpoint'))).toBe(true)
  })

  it('`onEvent` that USES the QueryClient bails — there is no shared client natively', () => {
    const r = swift(
      app(`
  const s = useStream<SseEvent<LogLine>>((ctx) => openEventStream((c) => tail({ params: { room: props.room }, signal: c.signal, headers: c.headers }), { signal: ctx.signal }), { onEvent: (ev, qc) => qc.invalidateQueries() })
  return <Text>{s.status()}</Text>`),
    )
    expect(r.warnings.some((w) => w.includes('`onEvent` uses its second argument (`qc`, the QueryClient)'))).toBe(true)
    expect(r.code).not.toContain('PyreonStream<')
  })

  it('a non-inline `onEvent` bails by name', () => {
    const r = kotlin(
      app(
        `
  const s = useStream<SseEvent<LogLine>>((ctx) => openEventStream((c) => tail({ params: { room: props.room }, signal: c.signal, headers: c.headers }), { signal: ctx.signal }), { onEvent: handler })
  return <Text>{s.status()}</Text>`,
        `const handler = (e: unknown) => e`,
      ),
    )
    expect(r.warnings.some((w) => w.includes('needs `onEvent` to be an inline function'))).toBe(true)
  })

  it('`parse` is named as ignored, and the stream still lowers', () => {
    const r = swift(
      app(`
  const s = useStream<SseEvent<LogLine>>((ctx) => openEventStream((c) => tail({ params: { room: props.room }, signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus, parse: (v) => v as LogLine }))
  return <Text>{s.status()}</Text>`),
    )
    expect(r.warnings.filter((w) => w.includes('option `parse` is IGNORED'))).toHaveLength(1)
    expect(r.code).toContain('PyreonStream<PyreonSseEvent<LogLine>>')
  })

  it('an opener used OUTSIDE useStream keeps the import warning', () => {
    const r = swift(
      app(
        `
  const s = useStream<SseEvent<LogLine>>((ctx) => openEventStream((c) => tail({ params: { room: props.room }, signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }))
  return <Text>{s.status()}</Text>`,
        `const loose = () => openEventStream((c) => tail({ params: { room: 'x' }, signal: c.signal }))`,
      ),
    )
    expect(r.warnings.some((w) => w.startsWith('openEventStream (from @pyreon/http/stream) has NO native lowering'))).toBe(true)
  })

  it('a stream endpoint consumed by useQuery is refused — its body is not one JSON value', () => {
    const r = swift(`
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
`)
    expect(r.warnings.some((w) => w.includes("declared `responseType: 'stream'`"))).toBe(true)
  })
})

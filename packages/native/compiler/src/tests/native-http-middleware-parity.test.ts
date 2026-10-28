// `createHttp({ use: [...] })` middleware — the web and the two native runtimes must agree, on the SAME inputs.
//
// One source file produces all three clients. If `retry` waits a different number of milliseconds on Android, or
// `bearer` sends a different header on iOS, the app behaves differently per platform with nothing to point at. So this
// asserts the contract by EXECUTION, the way `native-url-encoder-parity.test.ts` does for the path encoder:
//
//   - the WEB half runs the real middleware (`@pyreon/http/middleware`) through the real `compose`, with a scripted
//     transport and `Math.random` / `Date.now` / `setTimeout` pinned so the backoff schedule is observable;
//   - the NATIVE half compiles the shipped `PyreonHttp.{swift,kt}` VERBATIM with a harness, where the middleware list
//     is the expression the COMPILER EMITTED for the same `use: [...]` array (extracted from a real transform) — so
//     the scan, the emit and the runtime are all under test, not a hand-written copy of any of them;
//   - both produce one line per scenario (attempts, the Authorization header each attempt carried, every sleep, the
//     outcome, every log line, how many times the token was read) and the vectors must be equal.
//
// The scenarios target the places the two could plausibly disagree: header-name case, a nil vs empty token, the
// origin boundary, the full-jitter formula and its 20s cap, `Retry-After` in both forms against `maxDelay`, network
// errors with `network` on and off, non-idempotent verbs, and ORDER — `[bearer, retry]` and `[retry, bearer]` differ
// on the web, including the in-place-mutation case where a later token read returns null.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bearer, logger, retry } from '@pyreon/http/middleware'
import { compose } from '../../../../fundamentals/http/src/chain'
import { toHttpResponse } from '../../../../fundamentals/http/src/transport'
import type {
  HttpMethod,
  HttpMiddleware,
  HttpRequest,
} from '../../../../fundamentals/http/src/types'
import { transform } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SWIFT_SRC = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonHttp.swift')
const KOTLIN_SRC = join(
  __dirname,
  '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonHttp.kt',
)

type Mw =
  | { kind: 'bearer'; crossOrigin?: boolean }
  | { kind: 'retry'; opts?: string; web?: Parameters<typeof retry>[0] }
  | { kind: 'logger' }

interface Scenario {
  name: string
  method?: HttpMethod
  url?: string
  baseUrl?: string
  headers?: Record<string, string>
  /** One entry per attempt: a status, or -1 for a thrown network error. The last entry repeats. */
  script: number[]
  respHeaders?: Record<string, string>
  chain: Mw[]
  tokens?: (string | null)[]
  random?: number
  now?: number
}

const BASE = 'https://api.example.com/v1'

const SCENARIOS: Scenario[] = [
  {
    name: 'bearer',
    chain: [{ kind: 'bearer' }],
    tokens: ['abc'],
    script: [200],
    headers: { Authorization: 'old' },
  },
  { name: 'bearer-null', chain: [{ kind: 'bearer' }], tokens: [null], script: [200] },
  { name: 'bearer-empty', chain: [{ kind: 'bearer' }], tokens: [''], script: [200] },
  {
    name: 'bearer-foreign',
    chain: [{ kind: 'bearer' }],
    tokens: ['t'],
    script: [200],
    url: 'https://evil.example/x',
  },
  {
    name: 'bearer-foreign-optin',
    chain: [{ kind: 'bearer', crossOrigin: true }],
    tokens: ['t'],
    script: [200],
    url: 'https://evil.example/x',
  },
  {
    name: 'bearer-same-origin',
    chain: [{ kind: 'bearer' }],
    tokens: ['t'],
    script: [200],
    url: 'https://api.example.com/other',
  },
  { name: 'retry-default', chain: [{ kind: 'retry' }], script: [503, 503, 200], random: 0.5 },
  { name: 'retry-exhaust', chain: [{ kind: 'retry' }], script: [500], random: 0.25 },
  {
    name: 'retry-limit-0',
    chain: [{ kind: 'retry', opts: '{ limit: 0 }', web: { limit: 0 } }],
    script: [503, 200],
  },
  { name: 'retry-post', method: 'POST', chain: [{ kind: 'retry' }], script: [503, 200] },
  {
    name: 'retry-post-optin',
    method: 'POST',
    chain: [{ kind: 'retry', opts: "{ methods: ['POST'] }", web: { methods: ['POST'] } }],
    script: [503, 200],
    random: 0.5,
  },
  {
    name: 'retry-statuses',
    chain: [{ kind: 'retry', opts: '{ statuses: [418] }', web: { statuses: [418] } }],
    script: [418, 503, 200],
    random: 0.5,
  },
  {
    name: 'retry-after-seconds',
    chain: [{ kind: 'retry' }],
    script: [429, 200],
    respHeaders: { 'Retry-After': '2' },
  },
  {
    name: 'retry-after-capped',
    chain: [{ kind: 'retry', opts: '{ maxDelay: 1500 }', web: { maxDelay: 1500 } }],
    script: [429, 200],
    respHeaders: { 'retry-after': '2' },
  },
  {
    name: 'retry-after-ignored',
    chain: [
      { kind: 'retry', opts: '{ respectRetryAfter: false }', web: { respectRetryAfter: false } },
    ],
    script: [429, 200],
    respHeaders: { 'Retry-After': '2' },
    random: 0.5,
  },
  {
    name: 'retry-after-date',
    chain: [{ kind: 'retry' }],
    script: [503, 200],
    respHeaders: { 'Retry-After': 'Thu, 01 Jan 1970 00:00:10 GMT' },
    now: 4000,
  },
  {
    name: 'retry-after-garbage',
    chain: [{ kind: 'retry' }],
    script: [503, 200],
    respHeaders: { 'Retry-After': 'soon' },
    random: 0.5,
  },
  { name: 'retry-network', chain: [{ kind: 'retry' }], script: [-1, 200], random: 0.5 },
  {
    name: 'retry-network-off',
    chain: [{ kind: 'retry', opts: '{ network: false }', web: { network: false } }],
    script: [-1, 200],
  },
  { name: 'retry-network-exhaust', chain: [{ kind: 'retry' }], script: [-1], random: 0.5 },
  {
    name: 'retry-backoff-cap',
    chain: [{ kind: 'retry', opts: '{ limit: 6 }', web: { limit: 6 } }],
    script: [503],
    random: 0.1,
  },
  {
    name: 'bearer-outside-retry',
    chain: [{ kind: 'bearer' }, { kind: 'retry' }],
    tokens: ['a', 'b'],
    script: [503, 200],
    random: 0.5,
  },
  {
    name: 'bearer-inside-retry',
    chain: [{ kind: 'retry' }, { kind: 'bearer' }],
    tokens: ['a', 'b'],
    script: [503, 200],
    random: 0.5,
  },
  // The web mutates `request.headers` IN PLACE, so a later null token leaves the first header on the wire.
  {
    name: 'bearer-inside-retry-null',
    chain: [{ kind: 'retry' }, { kind: 'bearer' }],
    tokens: ['a', null],
    script: [503, 200],
    random: 0.5,
  },
  {
    name: 'logger',
    chain: [{ kind: 'logger' }],
    script: [204],
    url: 'https://u:p@api.example.com/v1/x?token=s#f',
  },
  { name: 'logger-failed', chain: [{ kind: 'logger' }], script: [-1] },
  {
    name: 'logger-outside-retry',
    chain: [{ kind: 'logger' }, { kind: 'retry' }],
    script: [503, 200],
    random: 0.5,
  },
  {
    name: 'logger-inside-retry',
    chain: [{ kind: 'retry' }, { kind: 'logger' }],
    script: [503, 200],
    random: 0.5,
  },
]

const urlOf = (s: Scenario): string => s.url ?? `${BASE}/x`
const methodOf = (s: Scenario): HttpMethod => s.method ?? 'GET'

/** JavaScript's `String(n)`; the native `fmt` prints a whole-valued double the same way. */
const num = (n: number): string => String(n)

const line = (r: {
  attempts: number
  auths: string[]
  sleeps: number[]
  final: string
  logs: string[]
  reads: number
}) =>
  [
    r.attempts,
    r.auths.join(','),
    r.sleeps.map(num).join(','),
    r.final,
    r.logs.join(';'),
    r.reads,
  ].join('|')

// ── the web half ────────────────────────────────────────────────────────────

async function runWeb(s: Scenario): Promise<string> {
  let reads = 0
  const tokens = s.tokens ?? []
  const token = (): string | null => {
    const v = tokens[Math.min(reads, tokens.length - 1)] ?? null
    reads += 1
    return v
  }
  const logs: string[] = []
  const chain: HttpMiddleware[] = s.chain.map((m) => {
    if (m.kind === 'bearer') return bearer(token, { crossOrigin: m.crossOrigin ?? false })
    if (m.kind === 'retry') return retry(m.web ?? {})
    return logger({ log: (l) => logs.push(l) })
  })
  const auths: string[] = []
  const sleeps: number[] = []
  vi.spyOn(Math, 'random').mockReturnValue(s.random ?? 0.5)
  vi.spyOn(Date, 'now').mockReturnValue(s.now ?? 0)
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
    sleeps.push(ms ?? 0)
    fn()
    return 0
  }) as never)
  const request: HttpRequest = {
    method: methodOf(s),
    url: urlOf(s),
    baseUrl: s.baseUrl ?? BASE,
    headers: new Headers(s.headers ?? {}),
    body: methodOf(s) === 'POST' ? '{}' : null,
    signal: undefined,
    credentials: undefined,
    meta: {},
  }
  let final: string
  try {
    const res = await compose(chain, async (req) => {
      const step = s.script[Math.min(auths.length, s.script.length - 1)]!
      auths.push(req.headers.get('authorization') ?? '-')
      if (step < 0) throw new TypeError('offline')
      return toHttpResponse(new Response(null, { status: step, headers: s.respHeaders ?? {} }), req)
    })(request)
    final = String(res.status)
  } catch {
    final = 'error'
  } finally {
    vi.restoreAllMocks()
  }
  return line({ attempts: auths.length, auths, sleeps, final, logs, reads })
}

afterEach(() => vi.restoreAllMocks())

/**
 * SEQUENTIALLY: each run pins `Math.random` / `Date.now` / `setTimeout` globally and restores them when it settles,
 * so overlapping runs (a `Promise.all`) would strip one another's spies mid-flight and record no sleeps at all.
 */
async function webVector(): Promise<string[]> {
  const out: string[] = []
  for (const s of SCENARIOS) out.push(await runWeb(s))
  return out
}

// ── the compiler half: the middleware list as EMITTED for this scenario's chain ──

function appFor(s: Scenario): string {
  const use = s.chain
    .map((m) => {
      if (m.kind === 'bearer') {
        return m.crossOrigin
          ? 'bearer(() => useAuth().store.token(), { crossOrigin: true })'
          : 'bearer(() => useAuth().store.token())'
      }
      if (m.kind === 'retry') return `retry(${m.opts ?? ''})`
      return 'logger()'
    })
    .join(', ')
  // Only what the chain uses: an unused import draws its own "has NO native lowering" warning.
  const imports = [...new Set(s.chain.map((m) => m.kind))].sort().join(', ')
  return `
import { createHttp } from '@pyreon/http'
import { ${imports} } from '@pyreon/http/middleware'
import { useFetch } from '@pyreon/hooks'
import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
interface R { id: string }
const useAuth = defineStore('auth', () => {
  const token = signal('')
  return { token }
})
const api = createHttp({ baseUrl: '${s.baseUrl ?? BASE}', use: [${use}] })
const ep = api.endpoint('GET /x')
export function C() {
  const r = useFetch<R>(ep())
  return <Stack><Text>{r.data()?.id ?? ''}</Text></Stack>
}
`
}

function emittedMiddleware(s: Scenario, target: 'swift' | 'kotlin'): string {
  const r = transform(appFor(s), { target })
  expect(r.warnings, `${s.name} must lower with no warnings`).toEqual([])
  const m =
    target === 'swift'
      ? /middleware: (\[.*\] as \[PyreonHttpMiddleware\])/.exec(r.code)
      : /middleware = (listOf<PyreonHttpMiddleware>\(.*\))\)$/m.exec(r.code)
  expect(m, `${s.name}: no middleware argument in the ${target} emit`).not.toBeNull()
  return m![1]!
}

// ── the native halves ───────────────────────────────────────────────────────

const swiftStr = (v: string): string => JSON.stringify(v)
const kotlinStr = (v: string): string => JSON.stringify(v).replace(/\$/g, '\\$')

function swiftScenario(s: Scenario, i: number): string {
  const tokens = (s.tokens ?? []).map((t) => (t === null ? 'nil' : swiftStr(t))).join(', ')
  const headers = Object.entries(s.headers ?? {})
    .map(([k, v]) => `${swiftStr(k)}: ${swiftStr(v)}`)
    .join(', ')
  const resp = Object.entries(s.respHeaders ?? {})
    .map(([k, v]) => `${swiftStr(k)}: ${swiftStr(v)}`)
    .join(', ')
  return `
func scenario${i}() async -> String {
    PyreonStore_auth.shared.script = [${tokens}]
    PyreonStore_auth.shared.reads = 0
    var sleeps: [Double] = []
    var logs: [String] = []
    var auths: [String] = []
    let script = [${s.script.join(', ')}]
    let env = PyreonHttpPipelineEnv(
        sleep: { sleeps.append($0) }, random: { ${s.random ?? 0.5} }, now: { ${s.now ?? 0} },
        log: { l, _ in logs.append(l) }, isDebug: true
    )
    var final = ""
    do {
        let res = try await PyreonHttpPipeline.run(
            PyreonHttpRequest(method: .${methodOf(s).toLowerCase()}, url: ${swiftStr(urlOf(s))}, headers: [${headers || ':'}], body: ${methodOf(s) === 'POST' ? 'Data("{}".utf8)' : 'nil'}),
            middleware: ${emittedMiddleware(s, 'swift')},
            env: env
        ) { req in
            let step = script[min(auths.count, script.count - 1)]
            auths.append(req.headers.first(where: { $0.key.lowercased() == "authorization" })?.value ?? "-")
            if step < 0 { throw URLError(.notConnectedToInternet) }
            return PyreonHttpResponse(status: step, headers: [${resp || ':'}])
        }
        final = String(res.status)
    } catch { final = "error" }
    return [String(auths.count), auths.joined(separator: ","), sleeps.map(fmt).joined(separator: ","), final,
            logs.joined(separator: ";"), String(PyreonStore_auth.shared.reads)].joined(separator: "|")
}`
}

function kotlinScenario(s: Scenario, i: number): string {
  const tokens = (s.tokens ?? []).map((t) => (t === null ? 'null' : kotlinStr(t))).join(', ')
  const headers = Object.entries(s.headers ?? {})
    .map(([k, v]) => `${kotlinStr(k)} to ${kotlinStr(v)}`)
    .join(', ')
  const resp = Object.entries(s.respHeaders ?? {})
    .map(([k, v]) => `${kotlinStr(k)} to ${kotlinStr(v)}`)
    .join(', ')
  return `
fun scenario${i}(): String {
    PyreonStore_auth.script = listOf<String?>(${tokens})
    PyreonStore_auth.reads = 0
    val sleeps = mutableListOf<Double>()
    val logs = mutableListOf<String>()
    val auths = mutableListOf<String>()
    val script = listOf(${s.script.join(', ')})
    val env = PyreonHttpPipelineEnv(
        sleep = { sleeps += it }, random = { ${s.random ?? 0.5} }, now = { ${s.now ?? 0}.0 },
        log = { l, _ -> logs += l }, isDebug = true,
    )
    val final = try {
        PyreonHttpPipeline.run(
            PyreonHttpRequest(method = PyreonHttpMethod.${methodOf(s)}, url = ${kotlinStr(urlOf(s))}, headers = mapOf<String, String>(${headers}), body = ${methodOf(s) === 'POST' ? '"{}"' : 'null'}),
            ${emittedMiddleware(s, 'kotlin')},
            env,
        ) { req ->
            val step = script[minOf(auths.size, script.size - 1)]
            auths += req.headers.entries.firstOrNull { it.key.equals("authorization", ignoreCase = true) }?.value ?: "-"
            if (step < 0) throw java.io.IOException("offline")
            PyreonHttpResponse(step, mapOf<String, String>(${resp}))
        }.status.toString()
    } catch (e: java.io.IOException) { "error" }
    return listOf(auths.size.toString(), auths.joinToString(","), sleeps.joinToString(",") { fmt(it) }, final,
        logs.joinToString(";"), PyreonStore_auth.reads.toString()).joinToString("|")
}`
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** `kotlinc` ships its own JVM for compiling, but running the jar needs one — commonly installed off PATH on a Mac. */
function jvmPath(): string | undefined {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return 'java'
  } catch {
    // fall through to the off-PATH locations
  }
  for (const c of ['/opt/homebrew/opt/openjdk/bin/java', '/opt/homebrew/opt/openjdk@17/bin/java']) {
    if (existsSync(c)) return c
  }
  return undefined
}

describe('createHttp `use` middleware — web ⇄ native parity, executed', () => {
  it('the web vector is what this file claims it is (a control for the harness)', async () => {
    // Pinned by hand so a broken web harness (say, a setTimeout spy that never fires) cannot make every vector agree
    // on nothing: full jitter at random 0.5 is 0.75 × base, base doubling from 1000.
    expect(await runWeb(SCENARIOS.find((s) => s.name === 'retry-default')!)).toBe(
      '3|-,-,-|750,1500|200||0',
    )
    expect(await runWeb(SCENARIOS.find((s) => s.name === 'bearer-inside-retry-null')!)).toBe(
      '2|Bearer a,Bearer a|750|200||2',
    )
    expect(await runWeb(SCENARIOS.find((s) => s.name === 'bearer-foreign')!)).toBe('1|-||200||0')
  })

  it.skipIf(!isSwiftcAvailable())(
    'the SHIPPED Swift runtime, driven by the EMITTED middleware, matches',
    async () => {
      const expected = await webVector()
      const got = withTempDir('pyreon-mw-parity-swift-', (dir) => {
        const harness = `import Foundation
final class PyreonStore_auth {
    static let shared = PyreonStore_auth()
    var script: [String?] = []
    var reads = 0
    var token: String? {
        let v = script.isEmpty ? nil : script[min(reads, script.count - 1)]
        reads += 1
        return v
    }
}
func fmt(_ d: Double) -> String { d == d.rounded() ? String(Int64(d)) : String(d) }
${SCENARIOS.map(swiftScenario).join('\n')}
var out: [String] = []
${SCENARIOS.map((_, i) => `out.append(await scenario${i}())`).join('\n')}
print(out.joined(separator: "\\n"))
`
        writeFileSync(join(dir, 'main.swift'), harness)
        writeFileSync(join(dir, 'PyreonHttp.swift'), readFileSync(SWIFT_SRC, 'utf8'))
        execFileSync(
          'swiftc',
          [join(dir, 'main.swift'), join(dir, 'PyreonHttp.swift'), '-o', join(dir, 'run')],
          {
            stdio: 'pipe',
          },
        )
        return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trimEnd().split('\n')
      })
      expect(got).toEqual(expected)
    },
    180_000,
  )

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)(
    'the SHIPPED Kotlin runtime, driven by the EMITTED middleware, matches',
    async () => {
      const java = jvmPath() as string
      const expected = await webVector()
      const got = withTempDir('pyreon-mw-parity-kotlin-', (dir) => {
        const harness = `package com.pyreon.runtime

object PyreonStore_auth {
    var script: List<String?> = emptyList()
    var reads = 0
    val token: String?
        get() {
            val v = if (script.isEmpty()) null else script[minOf(reads, script.size - 1)]
            reads += 1
            return v
        }
}
fun fmt(d: Double): String = if (d == Math.rint(d)) d.toLong().toString() else d.toString()
${SCENARIOS.map(kotlinScenario).join('\n')}
fun main() {
    println(listOf(${SCENARIOS.map((_, i) => `scenario${i}()`).join(', ')}).joinToString("\\n"))
}
`
        writeFileSync(join(dir, 'Main.kt'), harness)
        execFileSync(
          'kotlinc',
          [join(dir, 'Main.kt'), KOTLIN_SRC, '-include-runtime', '-d', join(dir, 'out.jar')],
          { stdio: 'pipe' },
        )
        return execFileSync(java, ['-cp', join(dir, 'out.jar'), 'com.pyreon.runtime.MainKt'], {
          encoding: 'utf8',
        })
          .trimEnd()
          .split('\n')
      })
      expect(got).toEqual(expected)
    },
    240_000,
  )
})

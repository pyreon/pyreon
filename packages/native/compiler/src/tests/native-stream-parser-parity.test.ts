import { execFile, execFileSync } from 'node:child_process'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  openEventStream,
  readEventStream,
  readNdjson,
  StreamParseError,
  type SseMessage,
} from '@pyreon/http/stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

/**
 * `useStream` over `@pyreon/http/stream` lowers to a native runtime on both
 * targets (`PyreonStream.swift` / `PyreonStream.kt`, co-located in
 * `@pyreon/http/native/`). ONE shared source then parses the same bytes three
 * times — and if any parser disagrees by a character, the same stream renders
 * different events per platform, silently.
 *
 * So the contract is asserted by EXECUTION, the way the URL-encoder parity is:
 *
 *   1. WIRE — a seeded corpus of byte streams (SSE and NDJSON, with every CR /
 *      LF / CRLF mix, BOMs, comments, NUL ids, retry values, multi-byte text,
 *      INVALID UTF-8, unterminated tails) is cut into chunks three ways
 *      (whole, byte-by-byte, random splits including EMPTY chunks) and fed to
 *      the real web parser and to the pure parser region extracted VERBATIM
 *      from each shipped runtime file, compiled by the real toolchain.
 *   2. LOOP — the real web `openEventStream`, the shipped Swift container over
 *      real `URLSession`, and the shipped Kotlin container over real
 *      `HttpURLConnection` each consume ONE scripted local server that drops
 *      the connection mid-event and checks `Last-Event-ID` on the reconnect.
 *      The event sequences, final status and the headers the SERVER saw must
 *      all agree.
 *
 * Nothing is re-typed here: the web side is the published module, the native
 * side is the file that ships.
 */

const SWIFT_SRC = join(__dirname, '../../../../fundamentals/http/native/swift/PyreonStream.swift')
const KOTLIN_SRC = join(
  __dirname,
  '../../../../fundamentals/http/native/kotlin/com/pyreon/runtime/PyreonStream.kt',
)

/** The pure parser region of a runtime file, between its BEGIN/END markers. */
function pureRegion(path: string): string {
  const src = readFileSync(path, 'utf8')
  const begin = src.indexOf('Wire parsing (pure) — BEGIN')
  const end = src.indexOf('Wire parsing (pure) — END')
  expect(begin, `BEGIN marker missing in ${path}`).toBeGreaterThan(-1)
  expect(end, `END marker missing in ${path}`).toBeGreaterThan(begin)
  // From the line after BEGIN to the start of END's line.
  return src.slice(src.indexOf('\n', begin) + 1, src.lastIndexOf('\n', end))
}

// ─── Corpus ──────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const enc = new TextEncoder()
const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Byte sequences a decoder must replace — each a different maximal-subpart shape. */
const INVALID: number[][] = [
  [0x80],
  [0xff],
  [0xe2, 0x82],
  [0xc0, 0xaf],
  [0xed, 0xa0, 0x80],
  [0xf4, 0x90, 0x80, 0x80],
  [0xf0, 0x9f, 0x98],
  [0xe0, 0x80, 0x41],
]
const TEXT_ATOMS = ['a', 'Z', ' ', ':', 'é', '日本', '🙂', '\t', ' ', '﻿', '{"x":1}', '0', '\0']
const EOLS = ['\n', '\r', '\r\n']

function randomText(r: () => number, bytes: Uint8Array[], allowInvalid: boolean): void {
  const n = Math.floor(r() * 5)
  for (let i = 0; i < n; i++) {
    if (allowInvalid && r() < 0.08) {
      bytes.push(new Uint8Array(INVALID[Math.floor(r() * INVALID.length)]!))
    } else {
      bytes.push(enc.encode(TEXT_ATOMS[Math.floor(r() * TEXT_ATOMS.length)]!))
    }
  }
}

function sseCase(r: () => number): Uint8Array {
  const parts: Uint8Array[] = []
  const boms = r() < 0.15 ? (r() < 0.3 ? 2 : 1) : 0
  for (let i = 0; i < boms; i++) parts.push(new Uint8Array([0xef, 0xbb, 0xbf]))
  const lines = 1 + Math.floor(r() * 14)
  for (let i = 0; i < lines; i++) {
    const k = r()
    if (k < 0.3) {
      parts.push(enc.encode(r() < 0.8 ? 'data: ' : r() < 0.5 ? 'data:' : 'data'))
      randomText(r, parts, true)
    } else if (k < 0.4) {
      parts.push(enc.encode('event: '))
      randomText(r, parts, true)
    } else if (k < 0.5) {
      parts.push(enc.encode(r() < 0.85 ? 'id: ' : 'id'))
      randomText(r, parts, true)
    } else if (k < 0.56) {
      // Digits only, or a near miss. Kept under 10 digits: a 20-digit retry is
      // a Number on the web and a clamped Int natively, a documented divergence
      // with no bearing on a real server.
      const digits = String(Math.floor(r() * 100000))
      parts.push(enc.encode(`retry: ${r() < 0.8 ? digits : `${digits}x`}`))
    } else if (k < 0.62) {
      parts.push(enc.encode(': '))
      randomText(r, parts, true)
    } else if (k < 0.66) {
      parts.push(enc.encode('foo: bar'))
    }
    // else: an empty line — the dispatch
    parts.push(enc.encode(EOLS[Math.floor(r() * EOLS.length)]!))
  }
  if (r() < 0.25) {
    parts.push(enc.encode('data: unterminated'))
  }
  return concat(parts)
}

const NDJSON_VALUES = ['1', '"s"', '{"a":[1,2]}', 'null', ' 2 ', '"é🙂"', '"\\u2028"', 'true', '[]']
const NDJSON_BLANKS = ['', ' ', '\t', ' ', '﻿', '　', ' ']

function ndjsonCase(r: () => number): Uint8Array {
  const parts: Uint8Array[] = []
  if (r() < 0.15) parts.push(new Uint8Array([0xef, 0xbb, 0xbf]))
  const lines = 1 + Math.floor(r() * 10)
  for (let i = 0; i < lines; i++) {
    const k = r()
    if (k < 0.6) parts.push(enc.encode(NDJSON_VALUES[Math.floor(r() * NDJSON_VALUES.length)]!))
    else if (k < 0.93) parts.push(enc.encode(NDJSON_BLANKS[Math.floor(r() * NDJSON_BLANKS.length)]!))
    else parts.push(enc.encode('nope'))
    if (i < lines - 1 || r() < 0.7) parts.push(enc.encode(EOLS[Math.floor(r() * EOLS.length)]!))
  }
  return concat(parts)
}

/** Three chunkings of one byte stream — whole, byte-by-byte, random with EMPTY chunks. */
function chunkings(bytes: Uint8Array, r: () => number): Uint8Array[][] {
  const whole = [bytes]
  const single = [...bytes].map((b) => new Uint8Array([b]))
  const random: Uint8Array[] = []
  let at = 0
  while (at < bytes.length) {
    if (r() < 0.15) random.push(new Uint8Array(0))
    const size = Math.min(bytes.length - at, 1 + Math.floor(r() * 6))
    random.push(bytes.slice(at, at + size))
    at += size
  }
  return [whole, single, random]
}

interface Case {
  format: 'sse' | 'ndjson'
  chunks: Uint8Array[]
}

/**
 * The hand-written shapes the fuzz might miss plus a seeded sweep.
 * Deterministic: the same seed builds the same corpus on every run.
 */
function buildCorpus(): Case[] {
  const r = mulberry32(0x5eed)
  const out: Case[] = []
  const fixed: [Case['format'], string | number[]][] = [
    ['sse', 'data: one\r\n\r\ndata: two\n\n'],
    ['sse', '﻿﻿data: x\n\n'],
    ['sse', 'data: a\r'],
    ['sse', [0x64, 0x61, 0x74, 0x61, 0x3a, 0x20, 0xe2, 0x0a, 0x0a]],
    ['ndjson', '1\n\n2\r\n3'],
    ['ndjson', [0xef, 0xbb]],
  ]
  for (const [format, v] of fixed) {
    const bytes = typeof v === 'string' ? enc.encode(v) : new Uint8Array(v)
    for (const chunks of chunkings(bytes, r)) out.push({ format, chunks })
  }
  for (let i = 0; i < 220; i++) {
    const bytes = sseCase(r)
    for (const chunks of chunkings(bytes, r)) out.push({ format: 'sse', chunks })
  }
  for (let i = 0; i < 120; i++) {
    const bytes = ndjsonCase(r)
    for (const chunks of chunkings(bytes, r)) out.push({ format: 'ndjson', chunks })
  }
  return out
}

// ─── Web oracle ──────────────────────────────────────────────────────────────

const hex = (s: string): string =>
  [...enc.encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('') || '-'

const body = (chunks: Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk)
      c.close()
    },
  })

/**
 * One case rendered as lines — `M type data id retry` per SSE message, or the
 * decoded NDJSON values followed by the first parse error. Both sides render
 * to this, so a mismatch reads as a plain diff.
 */
function renderSse(msgs: SseMessage[]): string[] {
  return msgs.map((m) => `M ${hex(m.type)} ${hex(m.data)} ${hex(m.id)} ${m.retry ?? '-'}`)
}

function renderNdjsonLines(lines: [number, string][]): string[] {
  const out: string[] = []
  for (const [n, text] of lines) {
    try {
      out.push(`V ${JSON.stringify(JSON.parse(text))}`)
    } catch {
      out.push(`E ${n} ${hex(text)}`)
      break
    }
  }
  return out
}

async function webRender(c: Case): Promise<string[]> {
  if (c.format === 'sse') {
    const msgs: SseMessage[] = []
    for await (const m of readEventStream(body(c.chunks))) msgs.push(m)
    return renderSse(msgs)
  }
  const out: string[] = []
  try {
    for await (const v of readNdjson(body(c.chunks))) out.push(`V ${JSON.stringify(v)}`)
  } catch (e) {
    if (!(e instanceof StreamParseError)) throw e
    out.push(`E ${e.line} ${hex(e.text)}`)
  }
  return out
}

/** Native output: `M …` / `L n hexText` lines per case, `END` between cases. */
function nativeRender(c: Case, raw: string[]): string[] {
  if (c.format === 'sse') return raw
  const lines: [number, string][] = raw.map((l) => {
    const [, n, h] = l.split(' ')
    const text = h === '-' ? '' : new TextDecoder().decode(Uint8Array.from(Buffer.from(h!, 'hex')))
    return [Number(n), text]
  })
  return renderNdjsonLines(lines)
}

const casesFile = (cases: Case[]): string =>
  cases
    .map(
      (c) =>
        `${c.format} ${c.chunks.map((ch) => (ch.length === 0 ? '-' : Buffer.from(ch).toString('hex'))).join(',')}`,
    )
    .join('\n')

function splitCases(stdout: string): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  for (const line of stdout.split('\n')) {
    if (line === 'END') {
      out.push(cur)
      cur = []
    } else if (line !== '') cur.push(line)
  }
  return out
}

// ─── Toolchains ──────────────────────────────────────────────────────────────

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** A JDK to RUN the jar — commonly installed off PATH under Homebrew. */
function jvmPath(): string | undefined {
  for (const c of [
    '/opt/homebrew/opt/openjdk/bin/java',
    '/opt/homebrew/opt/openjdk@17/bin/java',
  ]) {
    if (existsSync(c)) return c
  }
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return 'java'
  } catch {
    return undefined
  }
}

const SWIFT_WIRE_MAIN = (casesPath: string): string => `
let text = try! String(contentsOfFile: ${JSON.stringify(casesPath)}, encoding: .utf8)
func unhex(_ s: Substring) -> [UInt8] {
    if s == "-" { return [] }
    var out: [UInt8] = []
    var i = s.startIndex
    while i < s.endIndex {
        let j = s.index(i, offsetBy: 2)
        out.append(UInt8(s[i..<j], radix: 16)!)
        i = j
    }
    return out
}
func hexOf(_ s: String) -> String {
    let b = Array(s.utf8)
    return b.isEmpty ? "-" : b.map { String(format: "%02x", $0) }.joined()
}
var out = ""
for line in text.split(separator: "\\n", omittingEmptySubsequences: true) {
    let parts = line.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: false)
    let chunks = parts[1].split(separator: ",", omittingEmptySubsequences: false).map(unhex)
    var splitter = PyreonStreamLineSplitter()
    if parts[0] == "sse" {
        var parser = PyreonSseParser()
        for chunk in chunks { for b in chunk {
            if let l = splitter.push(b), let m = parser.line(l) {
                out += "M \\(hexOf(m.type)) \\(hexOf(m.data)) \\(hexOf(m.id)) \\(m.retry.map(String.init) ?? "-")\\n"
            }
        } }
    } else {
        var lines = PyreonNdjsonLines()
        for chunk in chunks { for b in chunk {
            if let l = splitter.push(b), let hit = lines.line(l) { out += "L \\(hit.0) \\(hexOf(hit.1))\\n" }
        } }
        if let tail = splitter.finish(), let hit = lines.line(tail) { out += "L \\(hit.0) \\(hexOf(hit.1))\\n" }
    }
    out += "END\\n"
}
print(out, terminator: "")
`

const KOTLIN_WIRE_MAIN = (casesPath: string): string => `
fun unhex(s: String): ByteArray =
    if (s == "-") ByteArray(0) else ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
fun hexOf(s: String): String {
    val b = s.toByteArray(Charsets.UTF_8)
    return if (b.isEmpty()) "-" else b.joinToString("") { String.format("%02x", it.toInt() and 0xFF) }
}
fun main() {
    val out = StringBuilder()
    for (line in java.io.File(${JSON.stringify(casesPath)}).readLines()) {
        if (line.isEmpty()) continue
        val format = line.substringBefore(' ')
        val chunks = line.substringAfter(' ').split(",").map(::unhex)
        val splitter = PyreonStreamLineSplitter()
        if (format == "sse") {
            val parser = PyreonSseParser()
            for (chunk in chunks) for (b in chunk) {
                val l = splitter.push(b) ?: continue
                val m = parser.line(l) ?: continue
                out.append("M ").append(hexOf(m.type)).append(' ').append(hexOf(m.data)).append(' ')
                    .append(hexOf(m.id)).append(' ').append(m.retry?.toString() ?: "-").append('\\n')
            }
        } else {
            val lines = PyreonNdjsonLines()
            for (chunk in chunks) for (b in chunk) {
                val l = splitter.push(b) ?: continue
                val hit = lines.line(l) ?: continue
                out.append("L ").append(hit.first).append(' ').append(hexOf(hit.second)).append('\\n')
            }
            splitter.finish()?.let { t -> lines.line(t)?.let { out.append("L ").append(it.first).append(' ').append(hexOf(it.second)).append('\\n') } }
        }
        out.append("END\\n")
    }
    print(out)
}
`

describe('native stream parsers — byte-for-byte parity with @pyreon/http/stream', () => {
  const corpus = buildCorpus()

  it('the corpus exercises every shape it claims to', () => {
    // A generator that silently stopped producing a shape would make the
    // parity below prove less than it says.
    const all = corpus.map((c) => Buffer.concat(c.chunks.map((x) => Buffer.from(x))))
    expect(all.some((b) => b.includes(Buffer.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf])))).toBe(true)
    expect(all.some((b) => b.includes(Buffer.from([0xed, 0xa0, 0x80])))).toBe(true)
    expect(all.some((b) => b.includes(Buffer.from('\r\n')))).toBe(true)
    expect(corpus.some((c) => c.chunks.some((x) => x.length === 0))).toBe(true)
    expect(corpus.filter((c) => c.format === 'sse').length).toBeGreaterThan(600)
    expect(corpus.filter((c) => c.format === 'ndjson').length).toBeGreaterThan(300)
  })

  it.skipIf(!isSwiftcAvailable())('the SHIPPED Swift parsers match, executed', async () => {
    const expected = await Promise.all(corpus.map(webRender))
    const got = withTempDir('pyreon-stream-parity-swift-', (dir) => {
      const casesPath = join(dir, 'cases.txt')
      writeFileSync(casesPath, casesFile(corpus))
      writeFileSync(join(dir, 'main.swift'), `import Foundation\n\n${pureRegion(SWIFT_SRC)}\n${SWIFT_WIRE_MAIN(casesPath)}`)
      execFileSync('swiftc', ['-O', join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
      return splitCases(execFileSync(join(dir, 'run'), { encoding: 'utf8', maxBuffer: 64 << 20 }))
    })
    expect(got.length).toBe(corpus.length)
    const diffs = corpus
      .map((c, i) => ({ i, want: expected[i], got: nativeRender(c, got[i]!) }))
      .filter((d) => JSON.stringify(d.want) !== JSON.stringify(d.got))
    expect(diffs.slice(0, 5)).toEqual([])
  }, 600_000)

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)(
    'the SHIPPED Kotlin parsers match, executed',
    async () => {
      const expected = await Promise.all(corpus.map(webRender))
      const got = withTempDir('pyreon-stream-parity-kotlin-', (dir) => {
        const casesPath = join(dir, 'cases.txt')
        writeFileSync(casesPath, casesFile(corpus))
        writeFileSync(join(dir, 'Main.kt'), `${pureRegion(KOTLIN_SRC)}\n${KOTLIN_WIRE_MAIN(casesPath)}`)
        execFileSync('kotlinc', [join(dir, 'Main.kt'), '-include-runtime', '-d', join(dir, 'out.jar')], {
          stdio: 'pipe',
        })
        return splitCases(
          execFileSync(jvmPath() as string, ['-jar', join(dir, 'out.jar')], {
            encoding: 'utf8',
            maxBuffer: 64 << 20,
          }),
        )
      })
      expect(got.length).toBe(corpus.length)
      const diffs = corpus
        .map((c, i) => ({ i, want: expected[i], got: nativeRender(c, got[i]!) }))
        .filter((d) => JSON.stringify(d.want) !== JSON.stringify(d.got))
      expect(diffs.slice(0, 5)).toEqual([])
    },
    600_000,
  )
})

// ─── Loop: one scripted server, three clients ────────────────────────────────

/**
 * Connection 1: sets `retry: 20`, sends ids 1 and 2, then half an event, then
 * DESTROYS the socket — a network failure mid-event. Connection 2 must carry
 * `Last-Event-ID: 2`, gets an event of a filtered-out type and id 4, and ends
 * cleanly, which (no `onEnd`) closes the stream.
 */
function streamServer(): { server: Server; seen: (string | null)[] } {
  const seen: (string | null)[] = []
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const n = seen.length
    const id = req.headers['last-event-id']
    seen.push(typeof id === 'string' ? id : null)
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    if (n === 0) {
      res.write('retry: 20\n\nid: 1\ndata: {"n":1}\n\n')
      res.write('id: 2\ndata: {"n":2}\n\n')
      res.write('id: 3\ndata: {"n":')
      setTimeout(() => res.socket?.destroy(), 30)
    } else {
      res.end('id: 3\nevent: skip\ndata: {"n":3}\n\nid: 4\ndata: {"n":4}\n\n')
    }
  })
  return { server, seen }
}

interface LoopResult {
  events: string[]
  status: string
  seen: (string | null)[]
}

const run = promisify(execFile)

const SWIFT_LOOP_MAIN = (url: string): string => `
struct Row: Decodable { var n: Int }

@main
struct Main {
    static func main() async {
        let s = PyreonStream<PyreonSseEvent<Row>>()
        await s.runSse(
            PyreonStreamRequest(url: ${JSON.stringify(url)}),
            options: PyreonSseOptions(events: ["message"], reconnect: PyreonStreamReconnect(attempts: 3, delay: 20, maxDelay: 100)),
            decode: PyreonStreamDecode.sseJSON(Row.self)
        )
        for e in s.events { print("E \\(e.type) \\(e.id) \\(e.data.n)") }
        print("S \\(s.status)")
    }
}
`

/** Just enough of androidx.compose.runtime for the container to compile on a JVM. */
const COMPOSE_STUB = `package androidx.compose.runtime
interface MutableState<T> { var value: T }
private class Box<T>(override var value: T) : MutableState<T>
fun <T> mutableStateOf(value: T): MutableState<T> = Box(value)
`

const KOTLIN_LOOP_MAIN = (url: string): string => `package com.pyreon.runtime
fun main() {
    val s = PyreonStream<PyreonSseEvent<Int>>()
    s.startSse(
        PyreonStreamRequest(url = ${JSON.stringify(url)}),
        PyreonSseOptions(events = listOf("message"), reconnect = PyreonStreamReconnect(attempts = 3, delay = 20, maxDelay = 100)),
    ) { m -> PyreonSseEvent(m.type, Regex("\\\\d+").find(m.data)!!.value.toInt(), m.id) }
    val deadline = System.currentTimeMillis() + 20_000
    while (s.status.value != "closed" && s.status.value != "error" && System.currentTimeMillis() < deadline) Thread.sleep(5)
    for (e in s.events.value) println("E \${e.type} \${e.id} \${e.data}")
    println("S \${s.status.value}")
}
`

function parseLoopOutput(stdout: string): { events: string[]; status: string } {
  const lines = stdout.split('\n').filter(Boolean)
  return {
    events: lines.filter((l) => l.startsWith('E ')).map((l) => l.slice(2)),
    status: lines.find((l) => l.startsWith('S '))?.slice(2) ?? '?',
  }
}

describe('native stream loop — reconnect + Last-Event-ID parity over a real server', () => {
  let web: LoopResult

  const withServer = async <T>(fn: (url: string) => Promise<T>): Promise<{ out: T; seen: (string | null)[] }> => {
    const { server, seen } = streamServer()
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/events`
    try {
      return { out: await fn(url), seen }
    } finally {
      server.closeAllConnections()
      await new Promise<void>((r) => server.close(() => r()))
    }
  }

  beforeAll(async () => {
    const { out, seen } = await withServer(async (url) => {
      const events: string[] = []
      let status = 'connecting'
      try {
        for await (const ev of openEventStream<{ n: number }>(
          async (ctx) => (await fetch(url, { headers: ctx.headers, signal: ctx.signal })).body,
          {
            events: ['message'],
            reconnect: { attempts: 3, delay: 20, maxDelay: 100 },
            onStatus: (s) => {
              status = s
            },
          },
        )) {
          events.push(`${ev.type} ${ev.id} ${ev.data.n}`)
        }
      } catch {
        status = 'error'
      }
      return { events, status }
    })
    web = { ...out, seen }
  })

  afterAll(() => undefined)

  it('the web client sees what the scenario scripts', () => {
    // The oracle itself, pinned: if this drifts, the two below compare
    // against the wrong thing.
    expect(web).toEqual({
      events: ['message 1 1', 'message 2 2', 'message 4 4'],
      status: 'closed',
      seen: [null, '2'],
    })
  })

  it.skipIf(!isSwiftcAvailable() || process.platform !== 'darwin')(
    'the SHIPPED Swift container behaves identically over URLSession',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-stream-loop-swift-'))
      try {
        const result = await withServer(async (url) => {
          writeFileSync(join(dir, 'PyreonStream.swift'), readFileSync(SWIFT_SRC, 'utf8'))
          writeFileSync(join(dir, 'main.swift'), `import Foundation\n${SWIFT_LOOP_MAIN(url)}`)
          await run('swiftc', ['-parse-as-library', join(dir, 'PyreonStream.swift'), join(dir, 'main.swift'), '-o', join(dir, 'run')])
          const { stdout } = await run(join(dir, 'run'), [], { timeout: 30_000 })
          return parseLoopOutput(stdout)
        })
        expect({ ...result.out, seen: result.seen }).toEqual(web)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    600_000,
  )

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)(
    'the SHIPPED Kotlin container behaves identically over HttpURLConnection',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-stream-loop-kotlin-'))
      try {
        const result = await withServer(async (url) => {
          writeFileSync(join(dir, 'PyreonStream.kt'), readFileSync(KOTLIN_SRC, 'utf8'))
          writeFileSync(join(dir, 'Compose.kt'), COMPOSE_STUB)
          writeFileSync(join(dir, 'Main.kt'), KOTLIN_LOOP_MAIN(url))
          await run('kotlinc', [
            join(dir, 'PyreonStream.kt'),
            join(dir, 'Compose.kt'),
            join(dir, 'Main.kt'),
            '-include-runtime',
            '-d',
            join(dir, 'out.jar'),
          ])
          const { stdout } = await run(jvmPath() as string, ['-jar', join(dir, 'out.jar')], { timeout: 30_000 })
          return parseLoopOutput(stdout)
        })
        expect({ ...result.out, seen: result.seen }).toEqual(web)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    600_000,
  )
})

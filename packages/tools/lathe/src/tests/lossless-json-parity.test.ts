/**
 * The lossless codec EMITTED into an axios / ky / fetch client, against
 * `@pyreon/http/json` as the ORACLE.
 *
 * Emitted rather than imported (an adapter client exists to not depend on
 * `@pyreon/http`), so the two copies can drift — and drift here is not
 * cosmetic: the same response would decode to a bigint under one `client`
 * setting and a rounded number under another. `adapter-url-parity.test.ts` is
 * the precedent for `buildUrl`; this is the same idea for JSON.
 *
 * Both parse layers are compared, not just the one this engine picks: the own
 * parser only runs where `context.source` is missing (Node 20, Hermes), so it
 * is forced here — for the emitted copy by hiding `context` from the FIRST
 * parse, which is when it memoizes the detection.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _setSourceTextSupport, parseJsonLossless, stringifyJsonLossless } from '@pyreon/http/json'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '.generated', 'lossless-parity')

const SPEC = `
openapi: 3.0.3
info: { title: P, version: '1' }
servers: [{ url: 'https://p.test' }]
paths:
  /n:
    get:
      operationId: getN
      tags: [n]
      responses: { '200': { content: { application/json: { schema: { type: integer, format: int64 } } } } }
`

interface Codec {
  parseJsonLossless: (text: string) => unknown
  stringifyJsonLossless: (value: unknown) => string
}

async function emitted(label: string): Promise<Codec> {
  const dir = join(ROOT, label)
  rmSync(dir, { recursive: true, force: true })
  const { files } = generate(SPEC, resolveConfig({ input: 'x', client: 'fetch', int64: 'bigint', plugins: ['schemas', 'client'] }))
  for (const f of files) {
    const p = join(dir, f.path)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, f.contents)
  }
  return (await import(join(dir, 'client.ts'))) as Codec
}

/** A corpus over the grammar, each forced off the fast path by a 16-digit run. */
function corpus(): string[] {
  let seed = 7
  const rnd = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed % n
  }
  const numbers = [
    '0', '-0', '1', '-1', '1.5', '-2.25e-7', '1e21', '1E+2', '9007199254740991', '-9007199254740991',
    '9007199254740992', '9007199254740993', '-9007199254740993', '18446744073709551615',
    '12345678901234567.5', '100000000000000000000', '123456789012345678901234567890',
  ]
  const strings = ['""', '"a"', '"\\"q\\""', '"\\\\"', '"\\n\\t\\u0000"', '"\\u00e9\\ud83d\\ude00"', '"9007199254740993"']
  const gen = (depth: number): string => {
    switch (depth > 3 ? rnd(3) : rnd(6)) {
      case 0:
        return numbers[rnd(numbers.length)] as string
      case 1:
        return ['true', 'false', 'null'][rnd(3)] as string
      case 2:
        return strings[rnd(strings.length)] as string
      case 3:
        return `[${Array.from({ length: rnd(4) }, () => gen(depth + 1)).join(', ')}]`
      default:
        return `{${Array.from({ length: rnd(4) }, () => `${strings[rnd(strings.length)]}: ${gen(depth + 1)}`).join(',')}}`
    }
  }
  const out = Array.from({ length: 300 }, () => `{"pad":1234567890123456,"v":${gen(0)}}`)
  // Malformed input: both must reject, with a SyntaxError.
  out.push('[9007199254740993,]', '{"a":9007199254740993', '09007199254740993', '[1] 1234567890123456', '-', '"\\x"')
  return out
}

const outcome = (parse: (t: string) => unknown, text: string): unknown => {
  try {
    return { ok: parse(text) }
  } catch (e) {
    return { threw: (e as Error).constructor.name }
  }
}

describe('the emitted lossless codec matches @pyreon/http/json', () => {
  afterAll(() => {
    _setSourceTextSupport(undefined)
    rmSync(ROOT, { recursive: true, force: true })
  })

  it('parse — the context.source layer', async () => {
    const codec = await emitted('source')
    _setSourceTextSupport(true)
    for (const text of corpus()) {
      expect(outcome(codec.parseJsonLossless, text), text).toEqual(outcome(parseJsonLossless, text))
    }
  })

  it('parse — the own-parser layer (engines without context.source)', async () => {
    const codec = await emitted('strict')
    // Hide `context` from the emitted copy's first parse: that is when it
    // memoizes whether the engine supports it.
    const native = JSON.parse
    JSON.parse = ((text: string, reviver?: (k: string, v: unknown) => unknown) =>
      native(text, reviver ? (k, v) => reviver(k, v) : undefined)) as typeof JSON.parse
    try {
      codec.parseJsonLossless('1234567890123456')
    } finally {
      JSON.parse = native
    }
    _setSourceTextSupport(false)
    for (const text of corpus()) {
      expect(outcome(codec.parseJsonLossless, text), text).toEqual(outcome(parseJsonLossless, text))
    }
    // And the forced layer is really the own parser: it still decodes exactly.
    expect(codec.parseJsonLossless('9007199254740993')).toBe(9007199254740993n)
  })

  it('stringify — with and without JSON.rawJSON', async () => {
    const codec = await emitted('stringify')
    const values: unknown[] = [
      { id: 9007199254740993n, n: [-1n, 2, 'x'], d: new Date(0), u: undefined },
      [18446744073709551615n],
      'plain',
      { s: 'a:1', b: 3n },
    ]
    const j = JSON as unknown as { rawJSON?: unknown }
    for (const v of values) expect(codec.stringifyJsonLossless(v)).toBe(stringifyJsonLossless(v))
    const saved = j.rawJSON
    delete j.rawJSON
    try {
      for (const v of values) expect(codec.stringifyJsonLossless(v)).toBe(stringifyJsonLossless(v))
    } finally {
      if (saved !== undefined) j.rawJSON = saved
    }
  })
})

/**
 * Streaming operations REACH NATIVE.
 *
 * A stream-only `GET` with a typed event (or an SSE stream read as text) gets
 * a `<Op>Stream` component in its tag's native module: `useStream` over
 * `@pyreon/http/stream`, which the native compiler lowers to the native stream
 * runtime (`PyreonStream`, SSE + NDJSON with the web's reconnect and
 * `Last-Event-ID` semantics). The reach report says `web+native` for exactly
 * those operations, and asks the SAME predicate the emitter does.
 *
 * Proven the way every other native claim in this package is: the real
 * compiler over the generated module, the POSITIVE marker, zero warnings, and
 * a compile against the stubs when a toolchain is present — plus the module
 * typechecking as ordinary TypeScript, since it also runs on the web.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  transform,
  validateKotlin,
  validateSwiftWithStubs,
} from '@pyreon/native-compiler'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { verifyNative, worstVerdict } from '../verify/lower'
import { cleanTypecheck, typecheckSpec } from './helpers/typecheck'

const SPEC = readFileSync(join(__dirname, 'fixtures', 'streams.json'), 'utf8')
const out = generate(SPEC, resolveConfig({ input: 'x', target: 'multiplatform' }))
const mod = (path: string): string => {
  const f = out.files.find((x) => x.path === path)
  if (!f) throw new Error(`no ${path}`)
  return f.contents
}

describe('stream operations reach native', () => {
  it('the reach report names every typed stream-only GET web+native', () => {
    expect(out.reach.get('roomEvents')).toEqual({ reach: 'web+native' })
    expect(out.reach.get('exportRows')).toEqual({ reach: 'web+native' })
    expect(out.reach.get('tailLog')).toEqual({ reach: 'web+native' })
    // A POST stream stays web — its body is a runtime value (the mutation rule).
    expect(out.reach.get('createChat')?.reach).toBe('web-only')
  })

  it('emits a stream component per such operation', () => {
    const rooms = mod('rooms.native.tsx')
    expect(rooms).toContain("export const roomEvents = api.endpoint('GET /rooms/:room/events', { responseType: 'stream' })")
    expect(rooms).toContain('export function RoomEventsStream(props: { room: string; children: (events: readonly SseEvent<RoomEvent>[]) => unknown })')
    expect(rooms).toContain('roomEvents({ params: { room: props.room }, signal: c.signal, headers: c.headers })')
    const rows = mod('rows.native.tsx')
    // An inline event type is named ONCE (see the emitter note).
    expect(rows).toContain('export type ExportRowsEvent = {')
    expect(rows).toContain("headers: { ...c.headers, accept: 'application/jsonl' }")
    expect(rows).toContain("{ data: 'text', signal: ctx.signal, onStatus: ctx.onStatus }")
    // A module of streams alone declares no schema, so it must not import `s`
    // — PMTC warns on the unused import by name.
    expect(rows).not.toContain("from '@pyreon/validate'")
  })

  for (const path of ['rooms.native.tsx', 'rows.native.tsx']) {
    for (const target of ['swift', 'kotlin'] as const) {
      it(`${path} lowers on ${target}: zero warnings, the PyreonStream marker`, () => {
        const r = transform(mod(path), { target })
        expect(r.warnings).toEqual([])
        expect(r.code).toContain('PyreonStream<')
        expect(r.code).not.toMatch(/\buseStream\(|\bopenEventStream\(|\bopenNdjsonStream\(/)
      })
    }
  }

  describe.skipIf(!isSwiftcAvailable())('swiftc', () => {
    for (const path of ['rooms.native.tsx', 'rows.native.tsx']) {
      it(`accepts ${path}`, () => {
        const v = validateSwiftWithStubs(transform(mod(path), { target: 'swift' }).code)
        expect(v.error ?? '').toBe('')
      })
    }
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc', () => {
    for (const path of ['rooms.native.tsx', 'rows.native.tsx']) {
      it(`accepts ${path}`, () => {
        const v = validateKotlin(transform(mod(path), { target: 'kotlin' }).code)
        expect(v.error ?? '').toBe('')
      })
    }
  })

  it('the verifier reports the stream modules as lowering', () => {
    const files = out.files.filter((f) => f.path === 'rooms.native.tsx' || f.path === 'rows.native.tsx')
    const report = verifyNative(files, transform)
    expect(report.files.map((f) => `${f.path} ${f.target} ${f.verdict}`)).toEqual([
      'rooms.native.tsx swift lowers',
      'rooms.native.tsx kotlin lowers',
      'rows.native.tsx swift lowers',
      'rows.native.tsx kotlin lowers',
    ])
    expect(worstVerdict(report)).toBe('lowers')
  })

  it('a module that uses useStream but did NOT lower is reported web-only, not lowers', () => {
    const report = verifyNative(
      [{ path: 'x.native.tsx', contents: 'const s = useStream(() => undefined)' }],
      () => ({ code: 'struct X {}', warnings: ['Declaration s: useStream lowers when … stays web'] }),
    )
    expect(report.files.every((f) => f.verdict === 'web-only')).toBe(true)
  })

  it('the native modules typecheck as ordinary TypeScript (they run on the web too)', () => {
    const native = Object.fromEntries(
      out.files.filter((f) => f.path.endsWith('.native.tsx')).map((f) => [f.path, f.contents]),
    )
    const { errors } = typecheckSpec('native-streams', SPEC, { target: 'multiplatform' }, { extra: native })
    cleanTypecheck('native-streams')
    expect(errors).toEqual([])
  })
})

describe('a stream with no declared event type stays web, and says why', () => {
  const UNTYPED = JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'U', version: '1' },
    servers: [{ url: 'https://u.test' }],
    paths: {
      '/feed': {
        get: {
          operationId: 'feed',
          responses: { 200: { content: { 'application/x-ndjson': {} } } },
        },
      },
    },
  })

  it('names the missing event type', () => {
    const r = generate(UNTYPED, resolveConfig({ input: 'x', target: 'multiplatform' }))
    const reach = r.reach.get('feed')
    expect(reach?.reach).toBe('web-only')
    expect(reach?.reason).toContain('no declared event type')
    expect(r.files.find((f) => f.path.endsWith('.native.tsx'))?.contents ?? '').not.toContain('useStream')
  })
})

/**
 * A NON-GET stream reaches native as a TRIGGERED component.
 *
 * A POST stream is started by the user, usually with a body, so the generated
 * component cannot open on mount the way a GET one does. It takes `enabled`
 * (the stream runs while it is true) and, for a JSON body, a `json` prop sent
 * as that body — the `useStream(src, { enabled })` + runtime `json` shape the
 * native compiler lowers when it is written by hand.
 *
 * Proven like every native claim in this package: the real compiler over the
 * generated module (POSITIVE marker, zero warnings), the stub compile gates,
 * the module typechecking as ordinary TypeScript — and a compile against the
 * SHIPPED stream runtime, because a stub can only confirm what it mirrors
 * (Swift here; Kotlin in @pyreon/native-compiler, see below).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  transform,
  validateKotlin,
  validateSwiftWithStubs,
} from '@pyreon/native-compiler'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { verifyNative, worstVerdict } from '../verify/lower'
import { cleanTypecheck, typecheckSpec } from './helpers/typecheck'

const SPEC = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Triggered', version: '1.0.0' },
  servers: [{ url: 'https://ai.test/v1' }],
  paths: {
    '/rooms/{room}/complete': {
      post: {
        operationId: 'complete',
        tags: ['ai'],
        parameters: [{ name: 'room', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CompleteRequest' } } } },
        responses: {
          200: {
            content: {
              'text/event-stream': {
                itemSchema: {
                  type: 'object',
                  properties: { data: { type: 'string', contentMediaType: 'application/json', contentSchema: { $ref: '#/components/schemas/Token' } } },
                },
              },
            },
          },
        },
      },
    },
    '/summarize': {
      post: {
        operationId: 'summarize',
        tags: ['ai'],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, lines: { type: 'integer' } } } } } },
        responses: { 200: { content: { 'application/x-ndjson': { itemSchema: { $ref: '#/components/schemas/Line' } } } } },
      },
    },
    '/ping': {
      post: {
        operationId: 'ping',
        tags: ['ops'],
        responses: { 200: { content: { 'text/event-stream': { schema: { type: 'string' } } } } },
      },
    },
    '/upload': {
      post: {
        operationId: 'upload',
        tags: ['ops'],
        requestBody: { content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } },
        responses: { 200: { content: { 'application/x-ndjson': { itemSchema: { $ref: '#/components/schemas/Line' } } } } },
      },
    },
    '/gates/{enabled}/watch': {
      post: {
        operationId: 'watchGate',
        tags: ['ops'],
        parameters: [{ name: 'enabled', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { content: { 'application/x-ndjson': { itemSchema: { $ref: '#/components/schemas/Line' } } } } },
      },
    },
  },
  components: {
    schemas: {
      CompleteRequest: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' }, maxTokens: { type: 'integer' } } },
      Token: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
      Line: { type: 'object', required: ['n', 'text'], properties: { n: { type: 'integer' }, text: { type: 'string' } } },
    },
  },
})

const out = generate(SPEC, resolveConfig({ input: 'x', target: 'multiplatform' }))
const mod = (path: string): string => {
  const f = out.files.find((x) => x.path === path)
  if (!f) throw new Error(`no ${path}; have ${out.files.map((x) => x.path).join(', ')}`)
  return f.contents
}
const MODULES = ['ai.native.tsx', 'ops.native.tsx'] as const

describe('a non-GET stream is a TRIGGERED native component', () => {
  it('reaches native — and a body it cannot send, or a shadowed prop, says why', () => {
    expect(out.reach.get('complete')).toEqual({ reach: 'web+native' })
    expect(out.reach.get('summarize')).toEqual({ reach: 'web+native' })
    expect(out.reach.get('ping')).toEqual({ reach: 'web+native' })
    expect(out.reach.get('upload')?.reach).toBe('web-only')
    expect(out.reach.get('upload')?.reason).toContain('carries a JSON body only')
    expect(out.reach.get('watchGate')?.reach).toBe('web-only')
    expect(out.reach.get('watchGate')?.reason).toContain('`enabled`')
  })

  it('takes `enabled` and the body as `json`, and gates the stream on the accessor', () => {
    const ai = mod('ai.native.tsx')
    expect(ai).toContain(
      'export function CompleteStream(props: { room: string; enabled: boolean; json: CompleteRequest; children: (events: readonly SseEvent<Token>[]) => unknown })',
    )
    expect(ai).toContain('complete({ params: { room: props.room }, json: props.json, signal: c.signal, headers: c.headers })')
    expect(ai).toContain('{ enabled: () => props.enabled },')
    // An inline object body is named ONCE, like an inline event.
    expect(ai).toContain('export type SummarizeBody = {')
    expect(ai).toContain('export function SummarizeStream(props: { enabled: boolean; json: SummarizeBody; children:')
    // No body → `enabled` only, and no `json` in the call.
    const ops = mod('ops.native.tsx')
    expect(ops).toContain('export function PingStream(props: { enabled: boolean; children:')
    expect(ops).toContain('ping({ signal: c.signal, headers: c.headers })')
    expect(ops).not.toContain('UploadStream')
    expect(ops).not.toContain('WatchGateStream')
  })

  for (const path of MODULES) {
    for (const target of ['swift', 'kotlin'] as const) {
      it(`${path} lowers on ${target}: zero warnings, the gate and the runtime body in the emit`, () => {
        const r = transform(mod(path), { target })
        expect(r.warnings).toEqual([])
        expect(r.code).toContain('PyreonStream<')
        expect(r.code).toContain('idle()')
        expect(r.code).not.toMatch(/\buseStream\(|\bopenEventStream\(|\bopenNdjsonStream\(/)
        if (path === 'ai.native.tsx') {
          expect(r.code).toContain(target === 'swift' ? 'PyreonJSON.stringify(json)' : 'PyreonJson.stringify(json)')
        }
      })
    }
  }

  describe.skipIf(!isSwiftcAvailable())('swiftc (stubs)', () => {
    for (const path of MODULES) {
      it(`accepts ${path}`, () => {
        expect(validateSwiftWithStubs(transform(mod(path), { target: 'swift' }).code).error ?? '').toBe('')
      })
    }
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc (stubs)', () => {
    for (const path of MODULES) {
      it(`accepts ${path}`, () => {
        expect(validateKotlin(transform(mod(path), { target: 'kotlin' }).code).error ?? '').toBe('')
      })
    }
  })

  const RUNTIME = join(__dirname, '../../../../fundamentals/http/native')
  const CORE_SWIFT = join(__dirname, '../../../../native/runtime-swift/Sources/PyreonRuntime')

  it.skipIf(!isSwiftUIAvailable())('Swift: compiles against the real SDK and the SHIPPED stream runtime', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lathe-triggered-swift-'))
    try {
      const files = MODULES.map((path, i) => {
        const p = join(dir, `M${i}.swift`)
        writeFileSync(p, `import SwiftUI\nimport Foundation\n${transform(mod(path), { target: 'swift' }).code}`)
        return p
      })
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
      execFileSync(
        'xcrun',
        [
          '--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk,
          ...files,
          join(RUNTIME, 'swift/PyreonStream.swift'),
          join(CORE_SWIFT, 'PyreonHttp.swift'),
          join(CORE_SWIFT, 'PyreonJSON.swift'),
          join(CORE_SWIFT, 'PyreonSchema.swift'),
        ],
        { stdio: 'pipe', encoding: 'utf8' },
      )
    } catch (err) {
      const e = err as { stderr?: string }
      expect.fail(`swiftc: ${(e.stderr ?? String(err)).split('\n').filter((l) => l.includes('error:')).slice(0, 8).join('\n')}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)

  // The Kotlin half of the real-runtime compile lives in @pyreon/native-compiler
  // (native-use-stream.test.ts, the TRIGGERED fixture there mirrors this
  // module's shape): it swaps the compiler's own stub block for the shipped
  // PyreonStream.kt, which this package cannot import across its rootDir.

  it('the verifier reports the triggered modules as lowering', () => {
    const report = verifyNative(
      out.files.filter((f) => (MODULES as readonly string[]).includes(f.path)),
      transform,
    )
    expect(report.files.every((f) => f.verdict === 'lowers')).toBe(true)
    expect(worstVerdict(report)).toBe('lowers')
  })

  it('the native modules typecheck as ordinary TypeScript (they run on the web too)', () => {
    const native = Object.fromEntries(
      out.files.filter((f) => f.path.endsWith('.native.tsx')).map((f) => [f.path, f.contents]),
    )
    const { errors } = typecheckSpec('native-triggered-streams', SPEC, { target: 'multiplatform' }, { extra: native })
    cleanTypecheck('native-triggered-streams')
    expect(errors).toEqual([])
  })
})

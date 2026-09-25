/**
 * Edge arms of the pieces added for the client / mocks / native-verdict pass:
 * the media-kind table, the deterministic pattern sampler and conformance
 * check, the input-type fallbacks, security-scheme reduction, and the
 * verifier's transform/compile failure paths.
 */
import type { IrField, IrOperation, IrType } from '../core/ir'
import { responseKindOf, responseKindTs } from '../core/media'
import { conforms, sampleFromPattern, sampleNumber, sampleString } from '../core/sample'
import { inputType, resolve } from '../emit/operation-types'
import { loadOpenApi } from '../input/openapi'
import { resolveNativeCompiler, resolveTransform, verifyNative, worstVerdict } from '../verify/lower'

const op = (over: Partial<IrOperation>): IrOperation => ({
  id: 'x',
  method: 'GET',
  path: '/x',
  tag: 't',
  pathParams: [],
  queryParams: [],
  headerParams: [],
  cookieParams: [],
  ...over,
})
const field = (over: Partial<IrField>): IrField => ({ name: 'f', type: { kind: 'string' }, required: true, ...over })

describe('response media kinds', () => {
  it('maps media types to a decode', () => {
    const k = (m?: string) => responseKindOf(op({ responseMedia: m }))
    expect(k()).toBe('json')
    expect(k('text/event-stream; charset=utf-8')).toBe('stream')
    expect(k('application/x-ndjson')).toBe('stream')
    expect(k('text/csv')).toBe('text')
    expect(k('application/xml')).toBe('text')
    expect(k('application/atom+xml')).toBe('text')
    expect(k('application/x-www-form-urlencoded')).toBe('text')
    expect(k('application/pdf')).toBe('blob')
    expect(responseKindTs('text')).toBe('string')
    expect(responseKindTs('blob')).toBe('Blob')
    expect(responseKindTs('stream')).toContain('ReadableStream')
  })
})

describe('pattern sampler', () => {
  const ok = (p: string) => {
    const v = sampleFromPattern(p)
    expect(v, p).toBeDefined()
    expect(new RegExp(p).test(v as string), `${p} -> ${JSON.stringify(v)}`).toBe(true)
  }
  it('covers escapes, classes, quantifiers and groups', () => {
    for (const p of ['^\\w\\s\\W\\D\\S$', '^a.b$', '^\\.\\-\\n\\t$', '^[\\d\\w\\s]$', '^[^a-z0-9]+$', '^[\\]x]$', '^[a\\-z]$', '^x*y?z+$', '^x{2,}$', '^x{1,3}?$', '^(?:ab|cd)$', '^[-a]$']) ok(p)
  })
  it('declines what it does not model', () => {
    for (const p of ['^a{b$', '^(?!x)y$', '\\1', '\\b', '(a', '[a', '*', 'a\\', '[^\\w\\d\\s_-aAx0]']) {
      const v = sampleFromPattern(p)
      if (v !== undefined) expect(new RegExp(p).test(v)).toBe(true)
    }
    expect(sampleFromPattern('^(?=a)a$')).toBeUndefined()
    expect(sampleFromPattern('^[]$')).toBeUndefined()
  })
})

describe('sample values', () => {
  it('strings honour pattern, format, length', () => {
    expect(sampleString({ kind: 'string', pattern: '^Z{2}$' }, field({}), 0)).toBe('ZZ')
    expect(sampleString({ kind: 'string', pattern: '(?=x)' }, field({}), 0)).toBe('sample f')
    for (const format of ['email', 'uri', 'uuid', 'date', 'date-time'] as const) {
      expect(sampleString({ kind: 'string', format }, undefined, 3).length).toBeGreaterThan(0)
    }
    expect(sampleString({ kind: 'string', maxLength: 3 }, field({}), 2)).toBe('sam')
    expect(sampleString({ kind: 'string', minLength: 12 }, field({}), 0)).toHaveLength(12)
    expect(sampleString({ kind: 'string' }, undefined, 0)).toBe('sample')
  })
  it('numbers stay in range', () => {
    expect(sampleNumber({ kind: 'number', integer: true, minimum: 2.5 }, 0)).toBe(3)
    expect(sampleNumber({ kind: 'number', integer: true, maximum: -1.5 }, 0)).toBe(-2)
    expect(sampleNumber({ kind: 'number', integer: false, maximum: 0 }, 0)).toBe(0)
  })
  it('conforms covers every kind', () => {
    const none = (): undefined => undefined
    const s: IrType = { kind: 'string' }
    expect(conforms(1, s, none)).toBe(false)
    expect(conforms('ab', { kind: 'string', minLength: 3 }, none)).toBe(false)
    expect(conforms('abcd', { kind: 'string', maxLength: 3 }, none)).toBe(false)
    expect(conforms('x', { kind: 'string', pattern: '^y$' }, none)).toBe(false)
    expect(conforms('x', { kind: 'string', pattern: '(' }, none)).toBe(false)
    expect(conforms(Number.NaN, { kind: 'number', integer: false }, none)).toBe(false)
    expect(conforms(1.5, { kind: 'number', integer: true }, none)).toBe(false)
    expect(conforms(1, { kind: 'number', integer: false, minimum: 2 }, none)).toBe(false)
    expect(conforms(9, { kind: 'number', integer: false, maximum: 2 }, none)).toBe(false)
    expect(conforms(2, { kind: 'number', integer: false, exclusiveMinimum: 2 }, none)).toBe(false)
    expect(conforms(2, { kind: 'number', integer: false, exclusiveMaximum: 2 }, none)).toBe(false)
    expect(conforms(3, { kind: 'number', integer: true, multipleOf: 2 }, none)).toBe(false)
    expect(conforms(null, { kind: 'null' }, none)).toBe(true)
    expect(conforms(null, { kind: 'nullable', inner: s }, none)).toBe(true)
    expect(conforms('x', { kind: 'nullable', inner: s }, none)).toBe(true)
    expect(conforms(null, s, none)).toBe(false)
    expect(conforms('b', { kind: 'enum', values: ['a'] }, none)).toBe(false)
    expect(conforms('x', { kind: 'null' }, none)).toBe(false)
    expect(conforms(true, { kind: 'boolean' }, none)).toBe(true)
    expect(conforms({}, { kind: 'unknown', reason: '' }, none)).toBe(true)
    expect(conforms('x', { kind: 'ref', name: 'M' }, none)).toBe(true)
    expect(conforms('x', { kind: 'ref', name: 'M' }, () => ({ kind: 'number', integer: true }))).toBe(false)
    expect(conforms([1], { kind: 'array', items: s }, none)).toBe(false)
    expect(conforms([], { kind: 'array', items: s, minItems: 1 }, none)).toBe(false)
    expect(conforms(['a', 'b'], { kind: 'array', items: s, maxItems: 1 }, none)).toBe(false)
    expect(conforms('x', { kind: 'array', items: s }, none)).toBe(false)
    expect(conforms('x', { kind: 'union', options: [{ kind: 'boolean' }, s] }, none)).toBe(true)
    expect(conforms([], { kind: 'object', fields: [] }, none)).toBe(false)
    const optional: IrType = { kind: 'object', fields: [field({ required: false, type: { kind: 'number', integer: true } })] }
    expect(conforms({}, optional, none)).toBe(true)
    expect(conforms({ f: 'x' }, optional, none)).toBe(false)
    expect(conforms({}, { kind: 'object', fields: [field({})] }, none)).toBe(false)
    // Depth bound: a deeply nested value is accepted rather than walked forever.
    expect(conforms(1, s, none, 9)).toBe(true)
  })
})

describe('input types', () => {
  it('widens what a URL or query string cannot carry, and adds undeclared placeholders', () => {
    const models = new Map<string, IrType>([['Flag', { kind: 'boolean' }]])
    const t = inputType(
      op({
        path: '/a/:id/:extra\\:x',
        pathParams: [{ name: 'id', type: { kind: 'ref', name: 'Flag' }, required: true }],
        queryParams: [
          { name: 'deep', type: { kind: 'object', fields: [field({ type: { kind: 'object', fields: [] } })] }, required: false },
          { name: 'u', type: { kind: 'union', options: [{ kind: 'string' }, { kind: 'number', integer: true }] }, required: true },
          { name: 'arr', type: { kind: 'array', items: { kind: 'ref', name: 'Missing' } }, required: false },
          { name: 'map', type: { kind: 'object', fields: [], additional: { kind: 'string' } }, required: false },
        ],
      }),
      models,
    )
    expect(t).toContain('params: { id: string | number; extra: string | number }')
    expect(t).toContain('deep?: string | undefined')
    expect(t).toContain('u: string | number')
    expect(t).toContain('arr?: string | undefined')
    expect(t).toContain('map?: string | undefined')
    expect(t).toMatch(/^\{ params: .*; query: \{/)
    expect(resolve({ kind: 'ref', name: 'Missing' }, models).kind).toBe('unknown')
  })
})

describe('security schemes', () => {
  it('reduces client-applicable schemes and notes the rest', () => {
    const doc = loadOpenApi(
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'T', version: '1' },
        paths: {},
        components: {
          securitySchemes: {
            a: { type: 'http', scheme: 'Bearer' },
            b: { type: 'openIdConnect', openIdConnectUrl: 'x' },
            c: { type: 'apiKey', in: 'query', name: 'k' },
            d: { type: 'apiKey', in: 'header' },
            e: { type: 'http', scheme: 'digest' },
            f: 'nonsense',
          },
        },
      }),
    ).doc
    expect(doc.securitySchemes?.map((s) => `${s.name}:${s.kind}`)).toEqual(['a:bearer', 'b:bearer', 'c:apiKey'])
    expect(doc.notes.filter((n) => n.at.includes('securitySchemes')).map((n) => n.at)).toEqual([
      '#/components/securitySchemes/d',
      '#/components/securitySchemes/e',
    ])
  })
})

describe('verifier failure paths', () => {
  const file = { path: 'm.native.tsx', contents: 'x' }
  it('a throwing transform or compile is reported, never a pass', () => {
    const r = verifyNative([file], () => {
      throw new Error('boom')
    })
    expect(r.files.map((f) => f.verdict)).toEqual(['broken', 'broken'])
    const t = () => ({ code: 'PyreonQuery<', warnings: ['Declaration q: something stays web'] })
    const c = verifyNative([file], t, {
      swift: () => {
        throw new Error('no swiftc')
      },
      kotlin: () => ({ ok: true, skipped: true }),
    })
    expect(c.files[0]?.compiled).toEqual({ skipped: 'compile threw: no swiftc' })
    expect(c.files[1]?.compiled).toEqual({ skipped: 'compiler not available' })
    expect(c.files[0]?.declarations[0]).toMatchObject({ name: 'q', verdict: 'web-only' })
    expect(worstVerdict(c)).toBe('web-only')
    expect(worstVerdict({ ran: true, files: [] })).toBe('skipped')
  })

  it('names a declaration from each warning spelling, and the module otherwise', () => {
    const r = verifyNative([file], () => ({
      code: 'PyreonQuery<',
      warnings: ['endpoint getX: query parameter `a` is OMITTED on iOS', 'field `z` — dropping.'],
    }))
    expect(r.files[0]?.declarations.map((d) => d.name)).toEqual(['(module)', 'getX'])
  })

  it('resolves the workspace compiler with its validators', async () => {
    const c = await resolveNativeCompiler()
    expect(typeof c.transform).toBe('function')
    expect(typeof c.compile.swift).toBe('function')
    expect(typeof c.compile.kotlin).toBe('function')
    expect(await resolveTransform()).toBe(c.transform)
  })
})

describe('verifier verdict arms', () => {
  const f = (contents: string) => [{ path: 'm.native.tsx', contents }]
  it('no markers: warnings mean web-only, silence means broken', () => {
    expect(verifyNative(f('x'), () => ({ code: '', warnings: ['info'] })).files[0]?.verdict).toBe('web-only')
    expect(verifyNative(f('x'), () => ({ code: '', warnings: [] })).files[0]?.verdict).toBe('broken')
  })
  it('a schema that did not lower is web-only; a leak is broken', () => {
    expect(verifyNative(f('s.object('), () => ({ code: 'PyreonQuery<', warnings: [] })).files[0]?.verdict).toBe('web-only')
    expect(verifyNative(f('x'), () => ({ code: 's.array(', warnings: [] })).files[0]?.verdict).toBe('broken')
  })
  it('a failed compile with no parseable error still fails, and a clean one passes', () => {
    const t = () => ({ code: 'PyreonQuery<', warnings: [] })
    const r = verifyNative(f('x'), t, { swift: () => ({ ok: false }), kotlin: () => ({ ok: true }) })
    expect(r.files[0]).toMatchObject({ verdict: 'broken', compiled: { ok: false, errors: [] } })
    expect(r.files[1]).toMatchObject({ verdict: 'lowers', compiled: { ok: true, errors: [] } })
  })
})

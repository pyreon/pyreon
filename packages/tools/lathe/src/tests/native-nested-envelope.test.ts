/**
 * A minimal nested response (`{ data: { id } }`) reaches native — and when a
 * module does NOT, the report says so for the real reason.
 *
 * pyreon/pyreon#3784: this ordinary envelope generated a data component whose
 * callback parameter and query generic were two different synthesized types on
 * both targets (a native-compiler naming bug, locked in
 * `native-nested-response-type-names.test.ts`). The report around it was wrong
 * three ways, each pinned here:
 *
 *   1. the operation was classified `web+native` beside a module neither
 *      `swiftc` nor `kotlinc` accepted (static reach never consulted the build);
 *   2. the module imported `zodSchema` it never called, so PMTC's blanket
 *      "zodSchema has NO native lowering" line was attached to a module whose
 *      real errors were nested type mismatches;
 *   3. the verifier demanded a schema marker for an inline `z.object(…)` that
 *      is an argument to `endpoint()`, not a declaration.
 */
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  transform,
  validateKotlin,
  validateSwiftWithStubs,
} from '@pyreon/native-compiler'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { reconcileReach, verifyNative, worstVerdict, type VerifyReport } from '../verify/lower'

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Example', version: '1.0.0' },
  servers: [{ url: 'https://example.test/api' }],
  paths: {
    '/item': {
      get: {
        operationId: 'getItem',
        tags: ['item'],
        responses: {
          '200': {
            description: 'Item',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['data'],
                  properties: {
                    data: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
})

const out = generate(SPEC, resolveConfig({ input: 'x', target: 'multiplatform', validator: 'zod' }))
const mod = out.files.find((f) => f.path === 'item.native.tsx')!.contents

describe('the minimal nested envelope', () => {
  it('imports zodSchema only when a named model binding calls it', () => {
    expect(mod).toContain("from 'zod'")
    expect(mod).not.toContain('zodSchema')
  })

  it('lowers with no warnings on either target', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(mod, { target })
      expect(r.warnings).toEqual([])
    }
  })

  it('is judged `lowers`, not `web-only` for lacking a schema marker', () => {
    const report = verifyNative(out.files, transform)
    expect(worstVerdict(report)).toBe('lowers')
  })

  describe.skipIf(!isSwiftcAvailable())('swiftc', () => {
    it('type-checks on Swift', () => {
      const r = validateSwiftWithStubs(transform(mod, { target: 'swift' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    })
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc', () => {
    it('compiles on Kotlin', () => {
      const r = validateKotlin(transform(mod, { target: 'kotlin' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    })
  })

  it('a NAMED model still imports and uses the wrapper', () => {
    const named = generate(
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'E', version: '1' },
        servers: [{ url: 'https://example.test/api' }],
        paths: {
          '/p': {
            get: {
              operationId: 'getPet',
              tags: ['pet'],
              responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
            },
          },
        },
        components: { schemas: { Pet: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
      }),
      resolveConfig({ input: 'x', target: 'multiplatform', validator: 'zod' }),
    )
    const src = named.files.find((f) => f.path === 'pet.native.tsx')!.contents
    expect(src).toContain("import { zodSchema } from '@pyreon/validation'")
    expect(src).toContain('zodSchema(z.object(')
  })
})

describe('reach follows the build, not only the IR', () => {
  const failed = (compiledErrors: string[]): VerifyReport => ({
    ran: true,
    files: [
      {
        path: 'item.native.tsx',
        target: 'swift',
        verdict: 'broken',
        warnings: ['an unrelated blanket warning'],
        markers: ['PyreonQuery<'],
        leaked: [],
        declarations: [],
        compiled: { ok: false, errors: compiledErrors },
      },
    ],
  })
  const reach = new Map([['getItem', { reach: 'web+native' as const }], ['other', { reach: 'web+native' as const }]])
  const ops = new Map([['item.native.tsx', ['getItem']]])

  it('an operation whose module failed to compile is web-only, naming the compiler error', () => {
    const r = reconcileReach(reach, ops, failed(["cannot convert value of type 'A?' to 'B?'"]))
    expect(r.get('getItem')).toEqual({
      reach: 'web-only',
      reason: "swift compile error: cannot convert value of type 'A?' to 'B?'",
    })
    // An operation in a module that did not fail is untouched.
    expect(r.get('other')).toEqual({ reach: 'web+native' })
  })

  it('without a compile error the reason is the warning that decided the verdict', () => {
    const r = reconcileReach(reach, ops, failed([]))
    expect(r.get('getItem')).toMatchObject({ reach: 'web-only', reason: 'swift lowering: an unrelated blanket warning' })
  })

  it('a SKIPPED verification leaves the static answer alone', () => {
    const r = reconcileReach(reach, ops, { ran: false, reason: 'no compiler', files: [] })
    expect(r.get('getItem')).toEqual({ reach: 'web+native' })
  })

  it('a module that lowers keeps web+native', () => {
    const ok: VerifyReport = {
      ran: true,
      files: [{ path: 'item.native.tsx', target: 'swift', verdict: 'lowers', warnings: [], markers: [], leaked: [], declarations: [] }],
    }
    expect(reconcileReach(reach, ops, ok).get('getItem')).toEqual({ reach: 'web+native' })
  })
})

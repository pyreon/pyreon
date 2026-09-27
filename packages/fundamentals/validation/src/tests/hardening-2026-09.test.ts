/**
 * Regression locks for the 2026-09 `@pyreon/validation` audit:
 *   - prototype-named field paths (`constructor` / `toString` / `__proto__`)
 *     must keep their error (a plain `{}` record + `errors[key] === undefined`
 *     never stored it — the form reported the field VALID);
 *   - `zodSchema` validates synchronously when it can (no Promise per call);
 *   - `arktypeSchema` recognises ArkType's error object by its brand, not by
 *     "any array with a `summary`".
 */
import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { arktypeSchema } from '../arktype'
import { standardSchemaToValidator } from '../schema'
import { issuesToRecord } from '../utils'
import { valibotSchema } from '../valibot'
import { zodSchema } from '../zod'

const PROTO_KEYS = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'] as const

describe('prototype-named field paths keep their error', () => {
  it.each(PROTO_KEYS)('issuesToRecord — %s', (key) => {
    const out = issuesToRecord([{ path: key, message: 'bad' }]) as Record<string, string | undefined>
    expect(Object.hasOwn(out, key)).toBe(true)
    expect(out[key]).toBe('bad')
  })

  it.each(PROTO_KEYS)('standardSchemaToValidator — %s', async (key) => {
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => ({ issues: [{ message: 'bad', path: [key] }] }),
      },
    }
    const out = (await standardSchemaToValidator(schema)({})) as Record<string, string | undefined>
    expect(Object.hasOwn(out, key)).toBe(true)
    expect(out[key]).toBe('bad')
  })

  it('an absent prototype-named field reads as NO error', async () => {
    const out = (await zodSchema(z.object({ a: z.string() })).validator({ a: 1 } as never)) as Record<
      string,
      unknown
    >
    expect(out.constructor).toBeUndefined()
    expect(out.toString).toBeUndefined()
  })

  it('real zod schema with a `constructor` field', async () => {
    const schema = z.object({ constructor: z.string().min(2) })
    const out = (await zodSchema(schema).validator({ constructor: 'x' } as never)) as Record<string, unknown>
    expect(Object.hasOwn(out, 'constructor')).toBe(true)
    expect(typeof out.constructor).toBe('string')
  })
})

describe('zodSchema — sync fast path', () => {
  it('returns the record synchronously for a sync schema', () => {
    const adapter = zodSchema(z.object({ a: z.string().min(2) }))
    const r = adapter.validator({ a: 'x' })
    expect(r).not.toBeInstanceOf(Promise)
    expect(r).toEqual({ a: expect.any(String) })
  })

  it('falls back to safeParseAsync for an async refine', async () => {
    const adapter = zodSchema(z.object({ a: z.string().refine(async (s) => s !== 'no', 'taken') }))
    const r = adapter.validator({ a: 'no' })
    expect(r).toBeInstanceOf(Promise)
    expect(await r).toEqual({ a: 'taken' })
    expect(await adapter.validator({ a: 'ok' })).toEqual({})
  })

  it('a genuinely throwing refine still surfaces as a form-level error', async () => {
    const adapter = zodSchema(
      z.object({
        a: z.string().refine(() => {
          throw new Error('boom')
        }),
      }),
    )
    expect(await adapter.validator({ a: 'x' })).toEqual({ '': 'boom' })
  })
})

describe('arktypeSchema — ArkErrors detection', () => {
  it('treats a VALID array output that happens to carry `summary` as valid', () => {
    const out = Object.assign(['a', 'b'], { summary: 'not an error' })
    const fakeArk = ((_: unknown) => out) as unknown as Parameters<typeof arktypeSchema>[0]
    const adapter = arktypeSchema(fakeArk)
    expect(adapter.validator({} as never)).toEqual({})
    expect(adapter.parse!({})).toEqual({ ok: true, value: out })
  })

  it('still detects real ArkType errors', () => {
    const adapter = arktypeSchema(type({ n: 'number' }))
    expect(adapter.parse!({ n: 'x' }).ok).toBe(false)
    expect(Object.keys(adapter.validator({ n: 'x' } as never) as object)).toEqual(['n'])
  })
})

describe('valibotSchema — prototype-named keys through a real adapter', () => {
  it('keeps the error for a `toString` field', async () => {
    const adapter = valibotSchema(v.object({ toString: v.pipe(v.string(), v.minLength(2)) }), v.safeParseAsync)
    const out = (await adapter.validator({ toString: 'x' } as never)) as Record<string, unknown>
    expect(Object.hasOwn(out, 'toString')).toBe(true)
  })
})

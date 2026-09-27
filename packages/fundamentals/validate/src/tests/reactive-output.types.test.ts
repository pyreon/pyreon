/**
 * `parseReactive` / `parseReactiveAsync` carry the schema's OUTPUT type — they
 * used to return `Computed<ParseResult<unknown>>`, forcing a cast on every read.
 */
import { signal } from '@pyreon/reactivity'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { parseReactive, parseReactiveAsync, type ParseResult } from '../reactive'
import { s } from '../v1'

describe('reactive parse — output typing', () => {
  it('parseReactive infers the output of a Pyreon schema', () => {
    const $r = parseReactive(s.object({ n: s.number() }), signal<unknown>({ n: 1 }))
    expectTypeOf($r()).toEqualTypeOf<ParseResult<{ n: number }>>()
  })
  it('parseReactive infers the output of a zod schema (transform applied)', () => {
    const $r = parseReactive(z.string().transform((v) => v.length), signal<unknown>('x'))
    expectTypeOf($r()).toEqualTypeOf<ParseResult<number>>()
  })
  it('parseReactiveAsync infers the output', () => {
    const $r = parseReactiveAsync(s.string(), signal<unknown>('x'))
    expectTypeOf($r()).toEqualTypeOf<Promise<ParseResult<string>>>()
  })
})

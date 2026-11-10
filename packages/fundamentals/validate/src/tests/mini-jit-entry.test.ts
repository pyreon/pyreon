/**
 * The `mini` entry ships WITHOUT the runtime JIT; `enableJit()` from
 * `@pyreon/validate/jit` opts in. This file must not import the main entry
 * (`../index`), which installs the JIT for the whole module graph.
 */
import { describe, expect, it } from 'vitest'
import type { JitValidator } from '../core/jit'
import { enableJit } from '../jit'
import { email, integer, minValue, number, object, string } from '../mini'

const shape = () =>
  object({ email: string().check(email()), age: number().check(integer(), minValue(0)) })

const isJit = (schema: ReturnType<typeof shape>): boolean =>
  (schema._getCompiledForSeam() as JitValidator)._jitPure === true

describe('mini entry — runtime JIT is opt-in', () => {
  it('compiles through the interpreter until enableJit() runs, with identical results', () => {
    const plain = shape()
    expect(isJit(plain)).toBe(false)
    const good = { email: 'a@b.co', age: 3 }
    const bad = { email: 'nope', age: -1 }
    const plainGood = plain.safeParse(good)
    const plainBad = plain.safeParse(bad)
    expect(plainGood.ok).toBe(true)
    expect(plain.is(bad)).toBe(false)

    enableJit()
    const jitted = shape()
    expect(isJit(jitted)).toBe(true)
    expect(jitted.safeParse(good)).toEqual(plainGood)
    expect(jitted.safeParse(bad)).toEqual(plainBad)
    expect(jitted.is(bad)).toBe(false)
  })
})

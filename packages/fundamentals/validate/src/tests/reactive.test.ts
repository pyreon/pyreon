/**
 * Tests for `parseReactive` + `parseReactiveAsync` + `watchValid`.
 *
 * These rely on `@pyreon/reactivity`'s `signal`/`computed`/`watch` —
 * exercises the full reactive bridge end-to-end.
 */

import { signal } from '@pyreon/reactivity'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parseReactive, parseReactiveAsync, watchValid } from '../reactive'

describe('parseReactive', () => {
  it('returns a success result for valid input', () => {
    const $input = signal('foo@bar.com')
    const $result = parseReactive(z.string().email(), $input)
    expect($result()).toMatchObject({ value: 'foo@bar.com' })
  })

  it('returns issues for invalid input', () => {
    const $input = signal('not-an-email')
    const $result = parseReactive(z.string().email(), $input)
    const r = $result()
    expect(r.issues).toBeDefined()
    expect(r.value).toBeUndefined()
  })

  it('re-validates on signal change (the headline contract)', () => {
    const $input = signal('foo@bar.com')
    const $result = parseReactive(z.string().email(), $input)

    // Initial — valid.
    expect($result().issues).toBeUndefined()

    // Flip to invalid.
    $input.set('not-an-email')
    expect($result().issues).toBeDefined()

    // Flip back to valid.
    $input.set('hello@world.com')
    expect($result().issues).toBeUndefined()
  })

  it('accepts a plain accessor function in place of a Signal', () => {
    const $a = signal(1)
    const $b = signal(2)
    const $result = parseReactive(z.number().int().min(0), () => $a() + $b())
    expect($result()).toMatchObject({ value: 3 })

    $b.set(-5)
    expect($result().issues).toBeDefined() // negative, fails .min(0)
  })

  it('surfaces an issue when the schema is async (sync-only API)', () => {
    // Zod async schema — refine returns a Promise.
    const schema = z.string().refine(async () => true)
    const $input = signal('whatever')
    const $result = parseReactive(schema, $input)
    const r = $result()
    expect(r.issues).toBeDefined()
    expect(r.issues?.[0]?.message).toContain('parseReactiveAsync')
  })

  it('works with Valibot schemas', () => {
    const $input = signal('foo@bar.com')
    const $result = parseReactive(v.pipe(v.string(), v.email()), $input)
    expect($result()).toMatchObject({ value: 'foo@bar.com' })

    $input.set('nope')
    expect($result().issues).toBeDefined()
  })

  it('is a Computed (memoised — repeated reads return the same ref)', () => {
    const $input = signal('foo@bar.com')
    const $result = parseReactive(z.string().email(), $input)
    const a = $result()
    const b = $result()
    // Memoised within the same source-stable window.
    expect(a).toBe(b)
  })
})

describe('parseReactiveAsync', () => {
  it('returns a Promise that resolves to the result', async () => {
    const $input = signal('foo@bar.com')
    const $result = parseReactiveAsync(z.string().email(), $input)
    await expect($result()).resolves.toMatchObject({ value: 'foo@bar.com' })
  })

  it('re-derives on signal change (Promise refreshes)', async () => {
    const $input = signal('foo@bar.com')
    const $result = parseReactiveAsync(z.string().email(), $input)

    await expect($result()).resolves.toMatchObject({ value: 'foo@bar.com' })

    $input.set('not-an-email')
    const r2 = await $result()
    expect(r2.issues).toBeDefined()
  })

  it('handles schemas with async refinements', async () => {
    const schema = z.string().refine(async (s) => s.length > 0)
    const $input = signal('hello')
    const $result = parseReactiveAsync(schema, $input)
    const r = await $result()
    expect(r).toMatchObject({ value: 'hello' })
  })
})

describe('watchValid', () => {
  it('fires the callback with initial validity', () => {
    const $input = signal('foo@bar.com')
    const calls: boolean[] = []
    const stop = watchValid(z.string().email(), $input, (v) => calls.push(v))
    expect(calls).toEqual([true])
    stop()
  })

  it('fires only on validity transitions, not on every error change', () => {
    const $input = signal('foo@bar.com')
    const calls: boolean[] = []
    const stop = watchValid(z.string().min(3), $input, (v) => calls.push(v))

    // Initial valid.
    expect(calls).toEqual([true])

    // Stay valid — no fire.
    $input.set('foobar')
    expect(calls).toEqual([true])

    // Flip to invalid — fire.
    $input.set('ab')
    expect(calls).toEqual([true, false])

    // Stay invalid (different message wouldn't matter) — no fire.
    $input.set('a')
    expect(calls).toEqual([true, false])

    // Flip back to valid — fire.
    $input.set('hello')
    expect(calls).toEqual([true, false, true])

    stop()
  })

  it('stops firing after unsubscribe', () => {
    const $input = signal('foo')
    const calls: boolean[] = []
    const stop = watchValid(z.string().min(3), $input, (v) => calls.push(v))
    expect(calls.length).toBe(1)
    stop()
    $input.set('a') // should NOT fire
    expect(calls.length).toBe(1)
  })

  it('works with Valibot schemas', () => {
    const $input = signal('foo@bar.com')
    const calls: boolean[] = []
    const stop = watchValid(v.pipe(v.string(), v.email()), $input, (v) => calls.push(v))
    expect(calls).toEqual([true])
    $input.set('bad')
    expect(calls).toEqual([true, false])
    stop()
  })
})

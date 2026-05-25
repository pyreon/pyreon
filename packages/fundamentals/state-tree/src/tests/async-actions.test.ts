/**
 * Async actions contract for `@pyreon/state-tree`.
 *
 * Pyreon signals are synchronous writes, so async actions in state-tree
 * just need:
 *   1. The action function may be `async` or return a `Promise`
 *   2. `runAction` returns the Promise verbatim so `await u.fetchPosts()`
 *      works end-to-end
 *   3. Middleware that wants to observe completion does `await next(call)`
 *
 * No `flow()` / `yield` wrapper needed (unlike MST).
 */
import { describe, expect, it, vi } from 'vitest'
import { addMiddleware } from '../middleware'
import { model } from '../model'

describe('async actions — basic contract', () => {
  it('async action returns a Promise that resolves with the action result', async () => {
    const M = model({ state: { value: 0 } }).actions((self) => ({
      async load(next: number): Promise<number> {
        // Simulate a network round-trip with a microtask boundary.
        await Promise.resolve()
        self.value.set(next)
        return next
      },
    }))
    const m = M.create() as ReturnType<typeof M.create> & {
      value: { (): number }
      load: (n: number) => Promise<number>
    }
    const result = await m.load(42)
    expect(result).toBe(42)
    expect(m.value()).toBe(42)
  })

  it('async action returning a Promise via plain function (not async/await) works', async () => {
    const M = model({ state: { value: 0 } }).actions((self) => ({
      load: (next: number): Promise<number> =>
        Promise.resolve().then(() => {
          self.value.set(next)
          return next * 2
        }),
    }))
    const m = M.create() as ReturnType<typeof M.create> & {
      value: { (): number }
      load: (n: number) => Promise<number>
    }
    const result = await m.load(5)
    expect(result).toBe(10)
    expect(m.value()).toBe(5)
  })

  it('rejected promise from action propagates to the awaiter', async () => {
    const M = model({ state: { value: 0 } }).actions(() => ({
      async fail(): Promise<never> {
        await Promise.resolve()
        throw new Error('boom')
      },
    }))
    const m = M.create() as ReturnType<typeof M.create> & {
      fail: () => Promise<never>
    }
    await expect(m.fail()).rejects.toThrow('boom')
  })

  it('multiple awaits inside an action — each tick can write a signal', async () => {
    const M = model({ state: { step: 0 } }).actions((self) => ({
      async run() {
        self.step.set(1)
        await Promise.resolve()
        self.step.set(2)
        await Promise.resolve()
        self.step.set(3)
      },
    }))
    const m = M.create() as ReturnType<typeof M.create> & {
      step: { (): number; subscribe: (cb: () => void) => () => void }
      run: () => Promise<void>
    }
    const observed: number[] = []
    const unsub = m.step.subscribe(() => observed.push(m.step()))
    await m.run()
    unsub()
    expect(m.step()).toBe(3)
    expect(observed).toContain(1)
    expect(observed).toContain(2)
    expect(observed).toContain(3)
  })
})

describe('async actions — middleware integration', () => {
  it('middleware sees async actions like any other call (call passes through)', async () => {
    const M = model({ state: { value: 0 } }).actions((self) => ({
      async load(n: number) {
        await Promise.resolve()
        self.value.set(n)
        return n
      },
    }))
    const m = M.create() as ReturnType<typeof M.create> & {
      load: (n: number) => Promise<number>
    }
    const spy = vi.fn((call: { name: string; args: unknown[] }, next: (c: typeof call) => unknown) =>
      next(call),
    )
    addMiddleware(m, spy as never)
    await m.load(7)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0].name).toBe('load')
    expect(spy.mock.calls[0]![0].args).toEqual([7])
  })

  it('middleware that awaits next(call) observes async completion', async () => {
    const order: string[] = []
    const M = model({ state: { value: 0 } }).actions((self) => ({
      async load() {
        await Promise.resolve()
        self.value.set(42)
        return 'done'
      },
    }))
    const m = M.create() as ReturnType<typeof M.create> & {
      load: () => Promise<string>
    }
    addMiddleware(m, async (call, next) => {
      order.push('mw-before')
      const result = await (next(call) as Promise<unknown>)
      order.push('mw-after')
      return result
    })
    order.push('caller-before')
    const r = await m.load()
    order.push('caller-after')
    expect(r).toBe('done')
    expect(order).toEqual(['caller-before', 'mw-before', 'mw-after', 'caller-after'])
  })

  it('middleware can catch async rejections via try/await', async () => {
    const captured: { name: string; error: string }[] = []
    const M = model({ state: { v: 0 } }).actions(() => ({
      async willThrow() {
        await Promise.resolve()
        throw new Error('async-fail')
      },
    }))
    const m = M.create() as ReturnType<typeof M.create> & {
      willThrow: () => Promise<never>
    }
    addMiddleware(m, async (call, next) => {
      try {
        return await (next(call) as Promise<unknown>)
      } catch (err) {
        captured.push({
          name: call.name,
          error: err instanceof Error ? err.message : String(err),
        })
        throw err
      }
    })
    await expect(m.willThrow()).rejects.toThrow('async-fail')
    expect(captured).toEqual([{ name: 'willThrow', error: 'async-fail' }])
  })

  it('mixed sync + async actions both flow through the same middleware', async () => {
    const seen: string[] = []
    const M = model({ state: { v: 0 } }).actions((self) => ({
      syncBump: () => self.v.update((n: number) => n + 1),
      async asyncBump() {
        await Promise.resolve()
        self.v.update((n: number) => n + 1)
      },
    }))
    const m = M.create() as ReturnType<typeof M.create> & {
      v: { (): number }
      syncBump: () => void
      asyncBump: () => Promise<void>
    }
    addMiddleware(m, (call, next) => {
      seen.push(call.name)
      return next(call)
    })
    m.syncBump()
    await m.asyncBump()
    expect(m.v()).toBe(2)
    expect(seen).toEqual(['syncBump', 'asyncBump'])
  })
})

describe('async actions — schema mode integration', () => {
  // Schema mode + async actions: patch / set inside an async body validates
  // each call at its checkpoint. A rejected validation propagates through the
  // action's promise.
  it('async action using patch validates each write', async () => {
    const { zodSchema } = await import('@pyreon/validation/zod')
    const { z } = await import('zod')

    const Schema = zodSchema(
      z.object({
        name: z.string().min(1),
        age: z.number().nonnegative(),
      }),
    )
    const User = model({
      schema: Schema,
      initial: { name: 'Alice', age: 30 },
    }).actions((self) => ({
      async setAge(next: number) {
        await Promise.resolve()
        ;(self.patch as (p: { age: number }) => void)({ age: next })
        return next
      },
    }))
    const u = User.create() as ReturnType<typeof User.create> & {
      age: { (): number }
      setAge: (n: number) => Promise<number>
    }
    await u.setAge(40)
    expect(u.age()).toBe(40)
    await expect(u.setAge(-1)).rejects.toThrow(/Schema validation failed/)
    // The pre-throw state survives — schema mode never half-writes.
    expect(u.age()).toBe(40)
  })
})

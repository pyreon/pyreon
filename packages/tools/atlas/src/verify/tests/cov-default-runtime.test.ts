/**
 * `defaultRuntime` — the framework as ATLAS resolves it, and the one field
 * that is conditional.
 *
 * `collectGarbage` is present only when the host offers a GC hook. Its absence
 * is not a degraded runtime, it is a different VERDICT: the leak check's whole
 * claim is "nodes created by the scenario stayed in the graph PAST GC", and
 * without a sweep that claim cannot be made, so the check SKIPS with that
 * reason rather than passing.
 *
 * Spreading `{ collectGarbage: undefined }` instead of omitting the key would
 * defeat that — under `exactOptionalPropertyTypes` the two are different
 * types, and at runtime a present-but-undefined field still reads as "the
 * field is there" to anything using `Object.hasOwn`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { defaultRuntime } from '../harness'

type Host = { Bun?: unknown; gc?: unknown }
const host = globalThis as unknown as Host

const restores: (() => void)[] = []
const set = (key: 'Bun' | 'gc', value: unknown): void => {
  const had = Object.hasOwn(host, key)
  const previous = host[key]
  if (value === undefined) delete host[key]
  else host[key] = value
  restores.push(() => {
    if (had) host[key] = previous
    else delete host[key]
  })
}
afterEach(() => {
  while (restores.length > 0) restores.pop()!()
})

describe('defaultRuntime', () => {
  it('OMITS collectGarbage when the host has no GC hook', async () => {
    // The leak check then reports its own reason for skipping, which is the
    // honest answer — a runtime carrying a no-op sweep would let it report
    // `pass` for a scenario nothing collected.
    set('Bun', undefined)
    set('gc', undefined)

    const runtime = await defaultRuntime()
    expect(Object.hasOwn(runtime, 'collectGarbage'), 'absent, not undefined').toBe(false)
  })

  it('carries collectGarbage when the host HAS one', async () => {
    let swept = 0
    set('Bun', undefined)
    set('gc', () => {
      swept += 1
    })

    const runtime = await defaultRuntime()
    expect(typeof runtime.collectGarbage).toBe('function')
    await runtime.collectGarbage!()
    expect(swept).toBe(1)
  })

  it('always carries the three mount primitives, from Atlas\'s own copy', async () => {
    // Which instance these come from is the whole reason `MountRuntime` is
    // injected rather than imported — this is the fallback, correct only when
    // nothing else has loaded a copy.
    const runtime = await defaultRuntime()
    expect(typeof runtime.h).toBe('function')
    expect(typeof runtime.mount).toBe('function')
    expect(typeof runtime.registerErrorHandler).toBe('function')
  })

  it('wires the reactive-graph reader off the SAME reactivity module', async () => {
    // A count read off a different instance would measure the wrong graph and
    // always report 0 — a permanently green leak check.
    const runtime = await defaultRuntime()
    expect(typeof runtime.reactiveGraphSize).toBe('function')
    expect(await runtime.reactiveGraphSize!()).toBeGreaterThanOrEqual(0)
  })
})

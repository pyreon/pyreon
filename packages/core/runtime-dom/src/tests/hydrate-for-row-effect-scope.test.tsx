/**
 * A `<For>` row callback owns the `effect()`s it creates (#3903) — and that
 * must hold for rows ADOPTED from server HTML exactly as for client-mounted
 * rows. Hydration adopts rows through its own path, which used to call the
 * row callback without the per-row collector scope, so an effect created in
 * the callback of a server-rendered list kept running after its row was
 * removed.
 */
import { For, h } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hydrateRoot } from '../index'

const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
let counts: Record<string, number>
let prevSink: typeof g.__pyreon_count__
beforeEach(() => {
  counts = {}
  prevSink = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
})
afterEach(() => {
  g.__pyreon_count__ = prevSink
  document.body.innerHTML = ''
})

describe('hydrated <For> rows own their callback effects', () => {
  it('a removed hydrated row stops running its effect, and dispose stops the rest', async () => {
    const tick = signal(0)
    let runs = 0
    // SSR renders the SAME markup without the effect — an effect created during
    // renderToString has no owner either and would pollute the run count.
    const app = (each: () => number[], withEffect: boolean) =>
      h(
        'ul',
        null,
        h(For, {
          each,
          by: (x: number) => x,
          children: (x: number) => {
            if (withEffect)
              effect(() => {
                tick()
                runs++
              })
            return h('li', null, String(x))
          },
        }),
      )
    const html = await renderToString(app(() => [1, 2], false) as never)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const firstLi = host.querySelector('li')

    const list = signal([1, 2])
    const dispose = hydrateRoot(host, app(() => list(), true))
    // Precondition: the rows were ADOPTED (not re-rendered fresh).
    expect(counts['runtime.mountFor.hydrateAdopt'] ?? 0).toBe(1)
    expect(host.querySelector('li')).toBe(firstLi)

    list.set([1])
    runs = 0
    tick.set(1)
    expect(runs).toBe(1)

    dispose()
    runs = 0
    tick.set(2)
    expect(runs).toBe(0)
  })
})

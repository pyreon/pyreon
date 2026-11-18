import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { ColorModeProvider, h, Suspense, systemColorMode, useColorMode } from '@pyreon/core'
import { computed, effect, signal } from '@pyreon/reactivity'
import { describe, expect, test } from 'vitest'
import { renderToStream, renderToString, runWithRequestContext } from '../index'

/**
 * An `effect()` / `computed()` a component creates during SSR has no owner of
 * its own — the server never mounts, so no component scope exists. Before the
 * fix nothing disposed it: each one reading a signal that outlives the request
 * (module state, a cache, `systemColorMode()`) added one subscriber per
 * request, forever, and its closure pinned whatever it captured (props,
 * children, request data). The request now owns such nodes and disposes them
 * when the render (or the request context, or the stream) ends.
 */

type Debuggable = { debug(): { subscriberCount: number } }
const subs = (s: unknown): number => (s as Debuggable).debug().subscriberCount
/** An `async function` component, typed for `h()` (which takes sync components). */
const asyncComp = (fn: () => Promise<VNodeChild>): ComponentFn => fn as unknown as ComponentFn

async function drain(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out += value
  }
}

describe('SSR reactive ownership', () => {
  test('renderToString disposes component effects and computeds (50 renders)', async () => {
    const g = signal(1)
    const base = subs(g)
    const Holder = (): VNodeChild => {
      effect(() => {
        g()
      })
      const c = computed(() => g() * 2)
      return h('span', null, String(c()))
    }
    for (let i = 0; i < 50; i++) {
      expect(await renderToString(h('div', null, h(Holder, null)))).toContain('2')
    }
    expect(subs(g)).toBe(base)
  })

  test('an effect created inside a reactive accessor is owned too', async () => {
    const g = signal(1)
    const base = subs(g)
    const Holder = (): VNodeChild =>
      h('p', null, () => {
        effect(() => {
          g()
        })
        return 'x'
      })
    for (let i = 0; i < 20; i++) await renderToString(h(Holder, null))
    expect(subs(g)).toBe(base)
  })

  test('<ColorModeProvider mode="system"> no longer subscribes per request', async () => {
    const sys = systemColorMode()
    const base = subs(sys)
    // A consumer reads the mode, which evaluates the provider's computed over
    // the module-level system signal.
    const Themed = (): VNodeChild => h('div', { class: `is-${useColorMode()()}` }, 'page')
    for (let i = 0; i < 50; i++) {
      expect(
        await renderToString(h(ColorModeProvider, { mode: 'system' }, h(Themed, null))),
      ).toContain('is-light')
    }
    expect(subs(sys)).toBe(base)
  })

  test('runWithRequestContext owns effects until its callback settles', async () => {
    const g = signal(1)
    const base = subs(g)
    const Holder = (): VNodeChild => {
      effect(() => {
        g()
      })
      return h('i', null, 'x')
    }
    for (let i = 0; i < 20; i++) {
      await runWithRequestContext(async () => {
        await renderToString(h(Holder, null))
        // Still inside the request: the nested render inherits the request,
        // so its effects live until the request ends, not the inner render.
        expect(subs(g)).toBe(base + 1)
      })
    }
    expect(subs(g)).toBe(base)
  })

  test('renderToStream disposes on close', async () => {
    const g = signal(1)
    const base = subs(g)
    const Holder = (): VNodeChild => {
      effect(() => {
        g()
      })
      return h('i', null, 'x')
    }
    for (let i = 0; i < 20; i++) await drain(renderToStream(h(Holder, null)))
    expect(subs(g)).toBe(base)
  })

  test('a stream started inside runWithRequestContext outlives the callback', async () => {
    // The production streaming handler returns the Response from inside the
    // request context, so the callback settles BEFORE the body streams. The
    // stream must keep the request alive until it ends.
    const g = signal(1)
    const base = subs(g)
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const Late = asyncComp(async () => {
      await gate
      effect(() => {
        g()
      })
      return h('b', null, 'late')
    })
    const stream = await runWithRequestContext(async () =>
      renderToStream(h('div', null, h(Suspense, { fallback: 'wait' }, h(Late, null)))),
    )
    const done = drain(stream)
    release()
    expect(await done).toContain('late')
    expect(subs(g)).toBe(base)
  })

  test('renderToStream disposes on cancel', async () => {
    const g = signal(1)
    const base = subs(g)
    const Holder = (): VNodeChild => {
      effect(() => {
        g()
      })
      return h('i', null, 'x')
    }
    const Never = asyncComp(async () => new Promise<VNodeChild>(() => {}))
    for (let i = 0; i < 10; i++) {
      const stream = renderToStream(
        h('div', null, h(Holder, null), h(Suspense, { fallback: 'wait' }, h(Never, null))),
        { suspenseTimeoutMs: Infinity },
      )
      const reader = stream.getReader()
      await reader.read()
      await reader.cancel()
    }
    expect(subs(g)).toBe(base)
  })

  test('two interleaved async renders own their own effects', async () => {
    const g = signal(1)
    const base = subs(g)
    let releaseA!: () => void
    const gateA = new Promise<void>((r) => {
      releaseA = r
    })
    const Before = (): VNodeChild => {
      effect(() => {
        g()
      })
      return 'before'
    }
    const AfterAwait = asyncComp(async () => {
      await gateA
      // Created in a continuation, after render B has started and finished.
      effect(() => {
        g()
      })
      return 'after'
    })
    const renderA = renderToString(h('div', null, h(Before, null), h(AfterAwait, null)))
    // A is parked on its await with one effect alive.
    expect(subs(g)).toBe(base + 1)
    const htmlB = await renderToString(h(Before, null))
    expect(htmlB).toBe('before')
    // B's end disposed only B's effect.
    expect(subs(g)).toBe(base + 1)
    releaseA()
    expect(await renderA).toContain('after')
    expect(subs(g)).toBe(base)
  })

  test('a render that throws still disposes what it created', async () => {
    const g = signal(1)
    const base = subs(g)
    const Boom = (): VNodeChild => {
      effect(() => {
        g()
      })
      throw new Error('boom')
    }
    await expect(renderToString(h(Boom, null))).rejects.toThrow('boom')
    expect(subs(g)).toBe(base)
  })
})

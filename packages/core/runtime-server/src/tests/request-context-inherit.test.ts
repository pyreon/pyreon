// @vitest-environment node
/**
 * Request-context inheritance — `renderToString` / `renderToStream` must
 * INHERIT an active `runWithRequestContext` ALS scope instead of opening a
 * fresh empty one.
 *
 * The shipped bug this locks against: both renderers always ran
 * `_contextAls.run([], …)`, so the nested ALS scope silently DISCARDED every
 * request-level `provide()` frame. `provideRequestLocals(ctx.locals)` in
 * `@pyreon/server`'s handler therefore never reached components —
 * `useRequestLocals()` always resolved the default — even though the
 * feature is documented end-to-end. Bisect-verified: reverting the inherit
 * branch in `renderToString` fails the request-level spec below with
 * `expected '<span>default</span>'`.
 *
 * Bare calls (no surrounding request context) must KEEP their fresh
 * isolated stack — two sibling renders can't see each other's frames.
 */
import { createContext, h, provide, useContext } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { renderToStream, renderToString, runWithRequestContext } from '../index'

const Ctx = createContext<string>('default')
const Reader = () => h('span', null, useContext(Ctx))

async function drain(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value !== undefined) out += value
  }
  return out
}

describe('request-context inheritance', () => {
  it('renderToString sees request-level provide() frames', async () => {
    const html = await runWithRequestContext(async () => {
      provide(Ctx, 'from-request')
      return renderToString(h(Reader, null))
    })
    expect(html).toBe('<span>from-request</span>')
  })

  it('renderToStream sees request-level provide() frames', async () => {
    const html = await runWithRequestContext(async () => {
      provide(Ctx, 'streamed-request')
      return drain(renderToStream(h(Reader, null)) as unknown as ReadableStream<string>)
    })
    expect(html).toContain('<span>streamed-request</span>')
  })

  it('request frames survive ACROSS multiple renders in one request', async () => {
    // The per-component trim restores the stack to each component's entry
    // length — request-level frames must outlive a full render and be
    // visible to the next one (e.g. a handler rendering the page AND a
    // 404/fragment in the same request).
    const [first, second] = await runWithRequestContext(async () => {
      provide(Ctx, 'persistent')
      const a = await renderToString(h(Reader, null))
      const b = await renderToString(h(Reader, null))
      return [a, b]
    })
    expect(first).toBe('<span>persistent</span>')
    expect(second).toBe('<span>persistent</span>')
  })

  it('bare renders stay ISOLATED from each other (no surrounding request)', async () => {
    // A component-pushed frame in render A must not leak into render B —
    // the fresh-stack behavior for bare calls is unchanged.
    const Provider = () => {
      provide(Ctx, 'leaky?')
      return h('b', null, useContext(Ctx))
    }
    const a = await renderToString(h(Provider, null))
    expect(a).toBe('<b>leaky?</b>')
    const b = await renderToString(h(Reader, null))
    expect(b).toBe('<span>default</span>')
  })

  it('two concurrent request contexts do not bleed into each other', async () => {
    const slowFast = await Promise.all([
      runWithRequestContext(async () => {
        provide(Ctx, 'req-A')
        await new Promise((r) => setTimeout(r, 10))
        return renderToString(h(Reader, null))
      }),
      runWithRequestContext(async () => {
        provide(Ctx, 'req-B')
        return renderToString(h(Reader, null))
      }),
    ])
    expect(slowFast[0]).toBe('<span>req-A</span>')
    expect(slowFast[1]).toBe('<span>req-B</span>')
  })
})

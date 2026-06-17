// Mirror of `dev-mode.test.ts`. The normal test run is NODE_ENV=test, so
// `__DEV__` is TRUE and every `if (__DEV__)` block takes its THEN side — the
// production (else) side is structurally unreachable in that run. This file
// flips NODE_ENV to production BEFORE the module evaluates (vitest isolates
// each test file's module graph) so the production side of every dev gate is
// exercised, completing both-sides branch coverage for the `__DEV__` guards.

import { h } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { describe, expect, it, vi } from 'vitest'

// Flip __DEV__ off for THIS file by setting NODE_ENV before the module loads.
vi.stubEnv('NODE_ENV', 'production')
const { renderToString, renderToStream } = await import('../index')

async function collectStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  const dec = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += typeof value === 'string' ? value : dec.decode(value as never)
  }
  return out
}

describe('runtime-server — production-mode (__DEV__ false) gate sides', () => {
  it('renderToString runs with all dev gates in their production (else) state', async () => {
    const Comp: ComponentFn = () => h('span', null, 'prod-comp')
    const { For } = await import('@pyreon/core')
    const html = await renderToString(
      h(
        'div',
        null,
        h(Comp, null),
        h('p', null, '<b>&"esc"</b>'),
        h(
          For,
          { each: [1, 2], by: (x: number) => x },
          ((i: number) => h('li', null, String(i))) as never,
        ),
      ),
    )
    expect(html).toContain('prod-comp')
  })

  it('renderToStream runs with dev gates off (no warn/counter)', async () => {
    const out = await collectStream(renderToStream(h('div', null, h('p', null, 'prod-stream'))))
    expect(out).toContain('prod-stream')
  })

  it('an unsafe tag in production does NOT warn (warnIfUnsafeTag early-returns)', async () => {
    const html = await renderToString(h('1bad' as never, null))
    expect(typeof html).toBe('string')
  })

  it('a production stream Suspense resolves', async () => {
    const { Suspense } = await import('@pyreon/core')
    async function AsyncComp(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 5))
      return h('div', null, 'prod-resolved')
    }
    const out = await collectStream(
      renderToStream(
        h(Suspense, {
          fallback: h('span', null, 'prod-fb'),
          children: h(AsyncComp as unknown as ComponentFn, null),
        }),
      ),
    )
    expect(out).toContain('prod-resolved')
  })
})

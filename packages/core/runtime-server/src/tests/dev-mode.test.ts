// runtime-server's `__DEV__` is a module-load constant
// (`process.env.NODE_ENV !== 'production'`). The package's other tests run
// under NODE_ENV=production (so __DEV__ is false and every `if (__DEV__)` dev
// counter / warning branch is dead). This file flips NODE_ENV to development
// BEFORE the module evaluates (vitest isolates each test file's module graph)
// and installs the perf-counter sink, so the dev-instrumentation branches —
// `__pyreon_count__` emits, the unsafe-tag warning, the per-component error
// log — are exercised legitimately rather than v8-ignored.

import { h } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('NODE_ENV', 'development')
const counts: string[] = []
;(globalThis as { __pyreon_count__?: (n: string) => void }).__pyreon_count__ = (n) =>
  counts.push(n)

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

describe('runtime-server — dev-mode (__DEV__ true) instrumentation', () => {
  it('a rich render fires the full counter surface (component/escape/for)', async () => {
    const { For } = await import('@pyreon/core')
    counts.length = 0
    const Comp: ComponentFn = () => h('span', null, 'dev-comp')
    await renderToString(
      h(
        'div',
        null,
        h(Comp, null), // → runtime-server.component
        h('p', null, '<b>&"escaped"</b>'), // → runtime-server.escape
        h(
          For,
          { each: [1, 2], by: (x: number) => x },
          ((i: number) => h('li', null, String(i))) as never,
        ), // → runtime-server.for.keyMarker
      ),
    )
    expect(counts).toContain('runtime-server.component')
  })

  it('renderToString emits the render counter', async () => {
    counts.length = 0
    await renderToString(h('div', null, h('p', null, 'dev')))
    expect(counts).toContain('runtime-server.render')
  })

  it('renderToStream emits the stream counter', async () => {
    counts.length = 0
    await collectStream(renderToStream(h('div', null, 'dev-stream')))
    expect(counts).toContain('runtime-server.stream')
  })

  it('an unsafe tag name warns in dev (warnIfUnsafeTag past the !__DEV__ guard)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await renderToString(h('1bad' as never, null))
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('a throwing ANONYMOUS component logs in dev (stream catch, name || "Anonymous")', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    // The per-component error log lives in the STREAM path (streamComponentNode),
    // which swallows + emits a marker so the stream continues. An unnamed
    // function expression → `.name` is '' → the `|| 'Anonymous'` arm.
    const anon = ((): never => {
      throw new Error('dev-anon-boom')
    }) as unknown as ComponentFn
    const out = await collectStream(
      renderToStream(h('div', null, h(anon, null), h('p', null, 'after-anon'))),
    )
    expect(out).toContain('after-anon')
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('a throwing NAMED component logs in dev (name truthy side)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    function NamedBad(): never {
      throw new Error('dev-named-boom')
    }
    const out = await collectStream(
      renderToStream(h('div', null, h(NamedBad as unknown as ComponentFn, null), h('p', null, 'after-named'))),
    )
    expect(out).toContain('after-named')
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('a stream Suspense timeout warns in dev', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { Suspense } = await import('@pyreon/core')
    async function Slow(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 200))
      return h('div', null, 'late')
    }
    await collectStream(
      renderToStream(
        h(Suspense, {
          fallback: h('span', null, 'dev-timeout-fb'),
          children: h(Slow as unknown as ComponentFn, null),
        }),
        { suspenseTimeoutMs: 1 },
      ),
    )
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('a stream Suspense boundary error logs in dev', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Suspense } = await import('@pyreon/core')
    async function Bad(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 3))
      throw new Error('dev-stream-suspense-boom')
    }
    await collectStream(
      renderToStream(
        h(Suspense, {
          fallback: h('span', null, 'dev-err-fb'),
          children: h(Bad as unknown as ComponentFn, null),
        }),
      ),
    )
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

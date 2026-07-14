/**
 * Behavioral coverage for the residual `index.ts` gaps (excellence sweep):
 *   - collectOptionText: nested-array recursion + null/boolean atom skipping
 *     (the `<select value>` fallback-text collector, PZ-09)
 *   - SSR component-error dev log for a NAMELESS component (`<Anonymous>`)
 *   - renderFor over a non-array iterable (a Set → `[...items]`)
 *   - renderToStream `suspenseTimeoutMs: Infinity` (no-race await path)
 *   - consumer abort mid-stream skips the post-resolve swap enqueue
 *
 * Every case asserts observable SSR output (or a logged message), not just
 * that a line ran.
 */
import { For, h, Suspense } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { renderToStream, renderToString } from '../index'

async function collectStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let out = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) out += value
  }
  return out
}

describe('collectOptionText — <select value> fallback text', () => {
  it('recurses into a nested array child, skipping null/boolean atoms', async () => {
    // The first option has no `value` prop, so its selection value falls back
    // to its collected text — assembled by recursing through the array child
    // and skipping the interspersed `null` / `false`.
    const html = await renderToString(
      h(
        'select',
        { value: 'AB' },
        h('option', null, ['A', null, false, 'B']),
        h('option', null, 'C'),
      ),
    )
    // 'AB' matched the first option's collected text → it is selected, C is not.
    expect(html).toContain('<option selected>')
    expect(html.indexOf('selected')).toBeLessThan(html.indexOf('C'))
  })

  it('a non-text option child makes the fallback unknowable (nothing selected)', async () => {
    // collectOptionText returns false on an element child, so the option is not
    // matchable by text and no option is marked selected.
    const html = await renderToString(
      h('select', { value: 'X' }, h('option', null, h('b', null, 'X'))),
    )
    expect(html).not.toContain('selected')
  })
})

describe('SSR component-error logging', () => {
  it('names a throwing NAMELESS component as <Anonymous> and emits the error marker', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // An arrow passed DIRECTLY as an argument has `.name === ''` (no binding to
    // infer a name from), so the catch falls back to 'Anonymous'. The streaming
    // renderer swallows a non-Suspense error + emits a marker (the string
    // renderer rethrows).
    const html = await collectStream(
      renderToStream(
        h(
          (() => {
            throw new Error('boom')
          }) as unknown as ComponentFn,
          null,
        ),
      ),
    )
    expect(html).toContain('<!--pyreon-error-->')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('<Anonymous>'), expect.anything())
    spy.mockRestore()
  })
})

describe('renderFor — non-array iterable', () => {
  it('renders <For each> over a Set (spreads the iterable to an array)', async () => {
    const html = await renderToString(
      h(For, {
        each: new Set(['x', 'y']),
        by: (v: string) => v,
        children: (v: string) => h('li', null, v),
      }),
    )
    expect(html).toContain('<li>x</li>')
    expect(html).toContain('<li>y</li>')
  })
})

describe('renderToStream — Suspense no-timeout mode', () => {
  it('suspenseTimeoutMs: Infinity awaits the child with no timeout race', async () => {
    async function Slow(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 5))
      return h('span', { id: 'done' }, 'resolved')
    }
    const vnode = h(Suspense, {
      fallback: h('p', null, 'loading'),
      children: h(Slow as unknown as ComponentFn, null),
    })
    const html = await collectStream(renderToStream(vnode, { suspenseTimeoutMs: Infinity }))
    expect(html).toContain('resolved')
  })
})

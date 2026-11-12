// `<For>` without `by` on the server (#4357): rendering used to fail inside the
// list with "by is not a function"; it now fails with the `[Pyreon]` error
// from `For()` that names the fix. Client side:
// runtime-dom/src/tests/for-without-by.test.ts.
import { For, h } from '@pyreon/core'
import { describe, expect, it, vi } from 'vitest'
import { renderToStream, renderToString } from '../index'

const list = () =>
  h('ul', null, h(For as never, { each: () => [1, 2], children: (n: number) => h('li', null, n) }))

describe('<For> without `by` on the server', () => {
  it('renderToString rejects with the [Pyreon] error', async () => {
    await expect(renderToString(list())).rejects.toThrow('[Pyreon] <For> requires a `by` prop')
  })

  it('renderToStream reports the same message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reader = renderToStream(list()).getReader()
    for (;;) {
      const { done } = await reader.read()
      if (done) break
    }
    const logged = spy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    spy.mockRestore()
    expect(logged).toContain('[Pyreon] <For> requires a `by` prop')
  })
})

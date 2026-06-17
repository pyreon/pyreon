// @vitest-environment node
//
// The SSR branch of `useHead(() => …)` (use-head.ts: function input + NOT
// isClient → evaluate once synchronously, no effect) is only reachable when
// `isClient` is false, i.e. there is no `document`. The package's other tests
// run under happy-dom (isClient === true), so they always take the client
// effect branch — this node-environment file is the only way to exercise the
// server path. `isClient` is a module-load constant from @pyreon/reactivity, so
// loading this file's graph under the `node` environment makes it false.
import { h } from '@pyreon/core'
import { describe, expect, test } from 'vitest'
import { useHead } from '../index'
import { renderWithHead } from '../ssr'

describe('useHead — SSR function-input path (node env, isClient=false)', () => {
  test('a reactive (function) input is evaluated ONCE synchronously on the server', async () => {
    function Page() {
      // function input + isClient false → the synchronous SSR branch
      useHead(() => ({ title: 'Node SSR Title' }))
      return h('div', null, 'body')
    }
    const { html, head } = await renderWithHead(h(Page, null))
    expect(html).toContain('<div>')
    expect(head).toContain('<title>Node SSR Title</title>')
  })
})

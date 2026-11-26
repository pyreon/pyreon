/**
 * Repeated SSR renders leave no error-boundary handler reachable from module
 * scope. Boundaries used to push onto a module-level stack and pop it in
 * `onUnmount`, which SSR never fires, so every server render leaked its
 * boundaries' handlers (and their closures) for the life of the process, and a
 * later dispatch outside any boundary went to a stale one. A boundary now
 * `provide()`s its handler, which the server pops with the subtree.
 */
import { ErrorBoundary, h } from '@pyreon/core'
import { dispatchToErrorBoundary } from '@pyreon/core/internal'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'

describe('SSR and error boundaries', () => {
  it('no handler outlives the render that created it', async () => {
    for (let i = 0; i < 3; i++) {
      const html = await renderToString(
        h('div', null, h(ErrorBoundary, { fallback: () => 'fb', children: h('b', null, 'ok') })),
      )
      expect(html).toContain('<b>ok</b>')
    }
    expect(dispatchToErrorBoundary(new Error('outside any boundary'))).toBe(false)
  })
})

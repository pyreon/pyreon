// @vitest-environment node
//
// The seam publishes only when `document` is undefined, and the renderer is a
// real one — so this file needs a node environment, not the package default.
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { defineStore, dehydrateStores } from '../index'

/**
 * The property that actually matters, through the real render path.
 *
 * It is deliberately NOT covered by the two half-locks — `registry-seam.ssr`
 * here and `store-isolation-autowire` in `runtime-server` — because both of
 * those can pass while the PAIR is broken. Two ways that could happen, and both
 * are live risks rather than hypotheticals:
 *
 *  - the seam is published and consulted, but nothing wires it in a real render
 *    (the original defect, one layer up);
 *  - isolation works and `dehydrateStores()` then reads the WRONG registry.
 *    `renderPage` opens a request scope and `renderToString` opens its own
 *    nested one, so the snapshot is taken in an outer scope while the stores
 *    were created in an inner one. If those were different maps the SSR
 *    hydration payload would be silently empty — the page would render
 *    correctly and then hydrate to default state.
 *
 * `@pyreon/runtime-server` is a devDependency for exactly this file.
 * fundamentals → core is the permitted direction and nothing ships it.
 */
describe('SSR store isolation, end to end', () => {
  it('isolates requests AND dehydrates each one’s own state', async () => {
    const useUser = defineStore('e2e-user', () => ({ name: signal('anonymous') }))

    const render = (who: string) =>
      runWithRequestContext(async () => {
        const Page = () => {
          // Read BEFORE writing: a leak from the previous request shows up here.
          const seen = useUser().store.name()
          useUser().store.name.set(who)
          return h('div', null, seen)
        }
        const html = await renderToString(h(Page, null))
        // Taken in the OUTER scope, as `renderPage` does.
        return { html, state: dehydrateStores() }
      })

    const first = await render('alice')
    const second = await render('bob')

    // Isolation: neither render saw the other's write.
    expect(first.html).toBe('<div>anonymous</div>')
    expect(second.html, "request B saw request A's state").toBe('<div>anonymous</div>')

    // Dehydration: each snapshot carries its OWN request's value, not an empty
    // object and not the other request's.
    expect(first.state['e2e-user']).toEqual({ name: 'alice' })
    expect(second.state['e2e-user']).toEqual({ name: 'bob' })
  })
})

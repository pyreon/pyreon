import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHeadContext, HeadProvider, useHead } from '../index'
import { renderWithHead } from '../ssr'

/**
 * `HeadProvider` resolves its HeadContext as `props.context ?? outer ?? fresh`.
 * That inheritance step is load-bearing for the documented composition
 * `renderWithHead(h(HeadProvider, null, h(App)))` AND for the
 * `@pyreon/zero` SSR/SSG pipeline (whose `createApp` mounts
 * `h(HeadProvider, null, …)` unconditionally with no `context` prop).
 *
 * Pre-fix `HeadProvider` ALWAYS auto-created a fresh ctx and `provide()`d
 * it — silently SHADOWING the ctx that `renderWithHead` had pushed onto
 * the per-request context stack. Every `useHead({...})` call in the
 * subtree wrote tags to the inner ctx (HeadProvider's), but
 * `renderWithHead` resolved the outer ctx (its own, still empty) and
 * produced an empty `<head>` string. Static SSG / SSR output shipped
 * with NO `<title>` / `<meta>` / JSON-LD / OG tags — social scrapers and
 * non-JS crawlers saw nothing. Fixed by adding `useContext(HeadContext)`
 * to the resolution chain so an outer ctx is inherited transparently.
 */
describe('HeadProvider — inherits an outer HeadContext (composability contract)', () => {
  it('REGRESSION: `renderWithHead(h(HeadProvider, null, h(App)))` carries useHead tags into <head>', async () => {
    // This is the EXACT shape `@pyreon/zero`'s `createApp` mounts:
    //   h(App, null) → h(HeadProvider, null, h(RouterProvider, …, h(RouterView, null)))
    // — i.e. the inner `HeadProvider` has no `context` prop. Pre-fix this
    // produced an empty `head` string; the rendered HTML was perfectly fine.
    const App: ComponentFn = () => {
      useHead({
        title: 'Page Title',
        meta: [{ name: 'description', content: 'page desc' }],
      })
      return h('div', null, 'app body')
    }

    const wrapped = h(HeadProvider as ComponentFn, null, h(App, null))
    const { html, head } = await renderWithHead(wrapped)

    expect(html).toContain('app body')
    expect(head).toContain('<title>Page Title</title>')
    expect(head).toContain('name="description"')
    expect(head).toContain('content="page desc"')
  })

  it('direct `h(App)` (no inner HeadProvider) still works — baseline parity', async () => {
    const App: ComponentFn = () => {
      useHead({ title: 'Baseline' })
      return h('div', null)
    }
    const { head } = await renderWithHead(h(App, null))
    expect(head).toContain('<title>Baseline</title>')
  })

  it('explicit `context` prop on the inner HeadProvider still wins (opt-out for isolation)', async () => {
    // Apps that genuinely want an isolated head registry (iframe / micro-
    // frontend) can pass their own ctx; the explicit prop overrides
    // inheritance. The outer ctx that `renderWithHead` resolves remains
    // empty in this case BY DESIGN — verifying the opt-out works.
    const isolatedCtx = createHeadContext()
    const App: ComponentFn = () => {
      useHead({ title: 'Isolated' })
      return h('div', null)
    }
    const wrapped = h(HeadProvider as ComponentFn, { context: isolatedCtx }, h(App, null))
    const { head } = await renderWithHead(wrapped)
    // Tags landed in the isolated ctx, NOT in renderWithHead's outer ctx
    expect(head).toBe('')
    // Confirm the tags really did go into the isolated ctx
    const isolatedTags = isolatedCtx.resolve()
    expect(isolatedTags.find((t) => t.tag === 'title')?.children).toBe('Isolated')
  })

  it('nested HeadProvider — inner inherits outer ctx, no shadow (registry stays single)', async () => {
    // Two HeadProviders in the same tree should write into ONE registry,
    // not two disjoint ones. Pre-fix the inner one created a fresh ctx,
    // so the outer registry (which renderWithHead resolves) lost the
    // inner subtree's tags. Post-fix the inner inherits the outer ctx
    // and tags from both subtrees land in the same resolved <head>.
    const Inner: ComponentFn = () => {
      useHead({ meta: [{ name: 'inner', content: 'inner-value' }] })
      return h('span', null, 'inner')
    }
    const Outer: ComponentFn = () => {
      useHead({ title: 'Outer Title' })
      return h('div', null, h(HeadProvider as ComponentFn, null, h(Inner, null)))
    }
    const { head } = await renderWithHead(h(Outer, null))
    expect(head).toContain('<title>Outer Title</title>')
    expect(head).toContain('name="inner"')
    expect(head).toContain('content="inner-value"')
  })

  describe('CSR root — fresh-ctx fallback preserved (regression guard for the fix)', () => {
    let container: HTMLElement
    beforeEach(() => {
      container = document.createElement('div')
      document.body.appendChild(container)
      for (const el of document.head.querySelectorAll('[data-pyreon-head]')) el.remove()
      document.title = ''
    })
    afterEach(() => {
      container.remove()
    })

    it('mounts at CSR root with NO `context` prop + NO outer provider → auto-creates fresh ctx, useHead works', () => {
      // When neither `props.context` nor an outer `HeadContext` is in
      // scope, HeadProvider must STILL auto-create a fresh ctx so pure
      // CSR roots work. If the fix accidentally regressed this path
      // (e.g. requiring an outer ctx), `useHead` would no-op silently
      // and `document.title` would stay empty.
      const App: ComponentFn = () => {
        useHead({ title: 'CSR Root' })
        return h('div', null)
      }
      mount(h(HeadProvider as ComponentFn, null, h(App, null)), container)
      expect(document.title).toBe('CSR Root')
    })
  })
})

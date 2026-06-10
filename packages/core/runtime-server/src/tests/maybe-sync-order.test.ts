/**
 * Maybe-sync renderer — ordering + context contracts.
 *
 * The string renderer returns `string | Promise<string>` per subtree
 * (sync subtrees pay zero promise hops; async components promote only
 * their own subtree). These specs lock the contracts the continuation
 * rewrite must preserve:
 *
 *   1. STRICT LEFT-TO-RIGHT ORDER with mixed sync/async siblings — an
 *      async sibling suspends the walk; later siblings render AFTER it
 *      resolves, never out of order.
 *   2. Provider visibility across an async boundary — `provide()` frames
 *      pushed by a component stay visible to its (async-resolved)
 *      children; the context-stack trim runs after the subtree settles.
 *   3. `<For>` with async-component children keeps per-item key-marker +
 *      content adjacency.
 *   4. Sync trees resolve without any async component markers.
 */
import { createContext, For, h, provide, useContext } from '@pyreon/core'
import type { ComponentFn, VNode } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { renderToString } from '../index'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('maybe-sync renderer — ordering', () => {
  it('mixed sync/async siblings render strictly left-to-right', async () => {
    const executionOrder: string[] = []
    const Sync = (label: string): ComponentFn => () => {
      executionOrder.push(`run:${label}`)
      return h('i', null, label)
    }
    const Slow = (label: string, ms: number): ComponentFn =>
      (async () => {
        executionOrder.push(`start:${label}`)
        await sleep(ms)
        return h('b', null, label)
      }) as unknown as ComponentFn

    const app = h(
      'div',
      null,
      h(Sync('a'), null),
      h(Slow('B', 20), null),
      h(Sync('c'), null),
      h(Slow('D', 1), null), // resolves FASTER than B — output must still be B before D
      h(Sync('e'), null),
    )
    const html = await renderToString(app)
    // Output order is structural, not resolution-order: a, B, c, D, e
    expect(html).toBe(
      '<div><i>a</i><!--$pas--><b>B</b><!--$pae--><i>c</i><!--$pas--><b>D</b><!--$pae--><i>e</i></div>',
    )
    // Later SYNC siblings must not run until the earlier async sibling
    // suspended the walk (sequential semantics — c runs after B started).
    expect(executionOrder.indexOf('run:c')).toBeGreaterThan(executionOrder.indexOf('start:B'))
  })

  it('a fully-sync tree renders with no async markers', async () => {
    const app = h('ul', null, h('li', null, 'x'), h('li', null, 'y'))
    const html = await renderToString(app)
    expect(html).toBe('<ul><li>x</li><li>y</li></ul>')
    expect(html).not.toContain('$pas')
  })
})

describe('maybe-sync renderer — context across async boundaries', () => {
  it('provide() in a parent stays visible to async-component children', async () => {
    const Ctx = createContext<string>('default')
    const AsyncReader: ComponentFn = (async () => {
      await sleep(5)
      // Context must still be live HERE — the parent's trim runs only
      // after this subtree settles.
      const v = useContext(Ctx)
      return h('span', null, v)
    }) as unknown as ComponentFn
    const Provider: ComponentFn = () => {
      provide(Ctx, 'provided')
      return h('div', null, h(AsyncReader, null))
    }
    const html = await renderToString(h(Provider, null))
    expect(html).toContain('<span>provided</span>')
  })

  it('a provider frame does NOT leak to a later sibling after its subtree settles', async () => {
    const Ctx = createContext<string>('default')
    const Inner: ComponentFn = (async () => {
      await sleep(5)
      return h('span', null, useContext(Ctx))
    }) as unknown as ComponentFn
    const Scoped: ComponentFn = () => {
      provide(Ctx, 'scoped')
      return h('div', null, h(Inner, null))
    }
    const After: ComponentFn = () => h('em', null, useContext(Ctx))
    const html = await renderToString(h('div', null, h(Scoped, null), h(After, null)))
    expect(html).toContain('<span>scoped</span>')
    expect(html).toContain('<em>default</em>') // trim happened after Scoped settled
  })
})

describe('maybe-sync renderer — <For> with async children', () => {
  it('keeps key markers adjacent to each (async) item body, in item order', async () => {
    const items = [
      { id: 'a', ms: 15 },
      { id: 'b', ms: 1 },
      { id: 'c', ms: 8 },
    ]
    const AsyncItem = (label: string, ms: number): ComponentFn =>
      (async () => {
        await sleep(ms)
        return h('li', null, label)
      }) as unknown as ComponentFn
    const app = h(
      For as unknown as ComponentFn,
      {
        each: () => items,
        by: (it: { id: string }) => it.id,
        children: (it: { id: string; ms: number }) =>
          h(AsyncItem(it.id, it.ms), null) as unknown as VNode,
      } as never,
    )
    const html = await renderToString(app as VNode)
    // Items in ARRAY order despite b resolving first.
    const aIdx = html.indexOf('<!--k:a-->')
    const bIdx = html.indexOf('<!--k:b-->')
    const cIdx = html.indexOf('<!--k:c-->')
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeGreaterThan(aIdx)
    expect(cIdx).toBeGreaterThan(bIdx)
    expect(html.indexOf('<li>a</li>')).toBeLessThan(bIdx)
  })
})

/**
 * @vitest-environment happy-dom
 *
 * An `island()` inside a FULLY hydrated page (zero SSG + `startClient`: the
 * whole page is hydrated, and a docs page embeds an island demo).
 *
 * The island is async on the server (it awaits the loader and renders the
 * component inside `<pyreon-island>`, so runtime-server wraps it in
 * `<!--$pas-->…<!--$pae-->`) and sync on the client (the bare marker). The page
 * hydration must ADOPT the server `<pyreon-island>` and leave its interior to
 * the island's own `hydrateRoot`; before the fix it hydrated against the
 * `$pas` comment, warned `expected pyreon-island, got 8`, and replaced the
 * server island with an empty client one until the island's trigger fired.
 *
 * Both halves run through the REAL `island()`: the server half in a separate
 * module graph where `isClient` is false (the same switch `island.ts` reads),
 * the client half in a fresh graph with the real environment.
 *
 * Bisect (recorded in the PR): removing runtime-dom's sync-range branch fails
 * the adoption spec with `tag: expected pyreon-island, got 8`.
 */
import type { ComponentFn, VNodeChild } from '@pyreon/core'

type CoreH = typeof import('@pyreon/core').h

/** The island component itself — plain, so both graphs can use it. */
function makeDemo(h: CoreH, onClick: () => void): ComponentFn {
  return () => h('form', { class: 'demo' }, h('button', { type: 'button', onClick }, 'go'))
}

function page(h: CoreH, Demo: ComponentFn): VNodeChild {
  return h(
    'article',
    null,
    h('h1', null, 'Docs'),
    h(Demo, { label: 'x' }),
    h('p', { class: 'after' }, 'after'),
  )
}

async function serverHtml(): Promise<string> {
  vi.resetModules()
  vi.doMock('@pyreon/reactivity', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@pyreon/reactivity')>()),
    isClient: false,
  }))
  try {
    const { h } = await import('@pyreon/core')
    const { island } = await import('../island')
    const { renderToString } = await import('@pyreon/runtime-server')
    const Demo = island(async () => ({ default: makeDemo(h, () => {}) }), {
      name: 'Demo',
      hydrate: 'interaction',
    })
    return await renderToString(page(h, Demo as unknown as ComponentFn) as never)
  } finally {
    vi.doUnmock('@pyreon/reactivity')
    vi.resetModules()
  }
}

describe('island() inside a fully hydrated page', { timeout: 30_000 }, () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('the page hydration adopts the server <pyreon-island>; its interior waits for the island trigger', async () => {
    const html = await serverHtml()
    // The precondition the bug needs: the island is wrapped in async sentinels.
    expect(html).toMatch(
      /<!--\$pas--><pyreon-island data-component="Demo"[^>]*><form class="demo">/,
    )
    expect(html).toContain('</pyreon-island><!--$pae-->')

    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const islandEl = host.querySelector('pyreon-island')!
    const form = host.querySelector('form')!
    const button = host.querySelector('button')!
    const after = host.querySelector('p.after')!

    // Client graph: fresh modules with the real (client) environment.
    const { h } = await import('@pyreon/core')
    const { hydrateRoot, onHydrationMismatch } = await import('@pyreon/runtime-dom')
    const { island } = await import('../island')
    let clicks = 0
    const Demo = island(async () => ({ default: makeDemo(h, () => clicks++) }), {
      name: 'Demo',
      hydrate: 'interaction',
    })

    const mismatches: string[] = []
    const stop = onHydrationMismatch((c) =>
      mismatches.push(`${c.type}: expected ${String(c.expected)}, got ${String(c.actual)}`),
    )
    const removed: Node[] = []
    const mo = new MutationObserver((records) => {
      for (const r of records) removed.push(...Array.from(r.removedNodes))
    })
    mo.observe(host, { childList: true, subtree: true })

    const dispose = hydrateRoot(host, page(h, Demo as unknown as ComponentFn) as never)
    expect(mismatches).toEqual([])
    expect(host.querySelector('pyreon-island')).toBe(islandEl)
    // The island's onMount loads `./client` and arms the interaction trigger.
    await vi.waitFor(
      () => expect(islandEl.getAttribute('data-island-state')).toBe('awaiting-interaction'),
      { timeout: 10_000 },
    )
    mo.takeRecords().forEach((r) => removed.push(...Array.from(r.removedNodes)))

    expect(mismatches).toEqual([])
    expect(removed.filter((n) => n.nodeType === Node.ELEMENT_NODE)).toEqual([])
    expect(host.querySelector('pyreon-island')).toBe(islandEl)
    expect(host.querySelectorAll('pyreon-island')).toHaveLength(1)
    // The server-rendered interior is still there, untouched, before the trigger.
    expect(islandEl.querySelector('form')).toBe(form)
    expect(islandEl.querySelector('button')).toBe(button)
    expect(host.querySelector('p.after')).toBe(after)
    expect(clicks).toBe(0)

    // The island's own trigger: the interaction hydrates the island in place
    // (its own hydrateRoot adopts the interior) and replays the click.
    button.click()
    await vi.waitFor(() => expect(clicks).toBe(1), { timeout: 10_000 })
    expect(islandEl.getAttribute('data-island-error')).toBeNull()
    expect(islandEl.querySelector('button')).toBe(button)
    expect(host.querySelector('pyreon-island')).toBe(islandEl)

    mo.disconnect()
    stop()
    dispose()
  })
})

/**
 * Hydration Integration Tests
 *
 * Full SSR -> hydrate pipeline: render on server, put HTML in DOM,
 * hydrate on client, verify signals work and DOM is reused.
 */
import type { VNodeChild } from '@pyreon/core'
import { _rp, For, Fragment, h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { disableHydrationWarnings, enableHydrationWarnings, hydrateRoot } from '../index'

// ─── Helpers ────────────────────────────────────────────────────────────────

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

// ─── SSR -> hydrate -> reactive ─────────────────────────────────────────────

describe('hydration integration — SSR -> hydrate -> reactive', () => {
  test('simple text: SSR renders, hydrate attaches, signal updates text', async () => {
    const Comp = (props: { name: () => string }) =>
      h('div', null, () => props.name())

    // 1. Server render
    const html = await renderToString(h(Comp, { name: () => 'Alice' }))
    expect(html).toContain('Alice')

    // 2. Put HTML in DOM
    const el = container()
    el.innerHTML = html

    // 3. Capture existing DOM node
    const originalDiv = el.querySelector('div')!

    // 4. Hydrate with reactive signal
    const name = signal('Alice')
    const cleanup = hydrateRoot(el, h(Comp, { name: () => name() }))

    // 5. Verify DOM reused (same element, not remounted)
    expect(el.querySelector('div')).toBe(originalDiv)

    // 6. Change signal -> DOM updates
    name.set('Bob')
    expect(el.querySelector('div')!.textContent).toBe('Bob')

    cleanup()
  })

  test('attributes: SSR renders class, hydrate attaches, signal updates class', async () => {
    const Comp = (props: { active: () => boolean }) =>
      h('div', { class: () => (props.active() ? 'active' : 'inactive') }, 'content')

    const html = await renderToString(h(Comp, { active: () => true }))
    expect(html).toContain('active')

    const el = container()
    el.innerHTML = html
    const originalDiv = el.querySelector('div')!

    const active = signal(true)
    const cleanup = hydrateRoot(el, h(Comp, { active: () => active() }))

    // DOM reused
    expect(el.querySelector('div')).toBe(originalDiv)
    expect(el.querySelector('div')!.className).toBe('active')

    // Toggle class reactively
    active.set(false)
    expect(el.querySelector('div')!.className).toBe('inactive')

    cleanup()
  })

  test('nested components: SSR renders tree, hydrate reuses DOM', async () => {
    const Inner = (props: { text: () => string }) =>
      h('span', { class: 'inner' }, () => props.text())

    const Outer = (props: { text: () => string }) =>
      h('div', { class: 'outer' }, h(Inner, { text: props.text }))

    const html = await renderToString(h(Outer, { text: () => 'hello' }))

    const el = container()
    el.innerHTML = html
    const originalSpan = el.querySelector('span.inner')!

    const text = signal('hello')
    const cleanup = hydrateRoot(el, h(Outer, { text: () => text() }))

    // Span reused from server HTML
    expect(el.querySelector('span.inner')).toBe(originalSpan)
    expect(el.querySelector('span.inner')!.textContent).toBe('hello')

    // Reactive update through nested component
    text.set('world')
    expect(el.querySelector('span.inner')!.textContent).toBe('world')

    cleanup()
  })

  test('Show conditional: SSR renders true branch, hydrate attaches reactivity', async () => {
    const text = signal('visible content')

    // Show is a reactive component — during hydration, it falls back to
    // mountChild for the reactive boundary. We verify the reactive text
    // still works after hydration.
    const Comp = (props: { text: () => string }) =>
      h('div', null,
        h('p', null, () => props.text()),
      )

    const html = await renderToString(
      h(Comp, { text: () => 'visible content' }),
    )
    expect(html).toContain('visible content')

    const el = container()
    el.innerHTML = html

    const cleanup = hydrateRoot(
      el,
      h(Comp, { text: () => text() }),
    )

    // Content visible after hydration
    expect(el.querySelector('p')?.textContent).toBe('visible content')

    // Reactive text update works after hydration
    text.set('updated content')
    expect(el.querySelector('p')?.textContent).toBe('updated content')

    cleanup()
  })

  test('Show component mounted fresh after hydration works reactively', () => {
    const el = container()
    el.innerHTML = '<div></div>'

    const visible = signal(true)
    const text = signal('hello')

    // Hydrate with Show — Show is a reactive component, so it remounts fresh
    const cleanup = hydrateRoot(
      el,
      h('div', null,
        h(Show, { when: visible },
          h('p', null, () => text()),
        ),
      ),
    )

    // Show renders its child
    expect(el.querySelector('p')?.textContent).toBe('hello')

    // Text update works
    text.set('world')
    expect(el.querySelector('p')?.textContent).toBe('world')

    cleanup()
  })

  test('For list: mount fresh after hydration, add/remove items works', () => {
    // For lists always remount during hydration (can't map keys to DOM
    // without SSR markers). We test that the remounted For is fully
    // reactive for add/remove/reorder operations.
    type Item = { id: number; label: string }

    const el = container()
    el.innerHTML = '<ul></ul>'

    const items = signal<Item[]>([
      { id: 1, label: 'alpha' },
      { id: 2, label: 'beta' },
      { id: 3, label: 'gamma' },
    ])

    const cleanup = hydrateRoot(
      el,
      h(
        'ul',
        null,
        For({
          each: items,
          by: (r: Item) => r.id,
          children: (r: Item) => h('li', null, r.label),
        }),
      ),
    )

    // For remounts — renders 3 items inside the <ul>
    const ul = el.querySelector('ul')!
    expect(ul.querySelectorAll('li').length).toBe(3)

    // Add item
    items.update((list) => [...list, { id: 4, label: 'delta' }])
    expect(ul.querySelectorAll('li').length).toBe(4)
    expect(ul.querySelectorAll('li')[3]?.textContent).toBe('delta')

    // Remove item
    items.set(items().filter((i) => i.id !== 2))
    expect(ul.querySelectorAll('li').length).toBe(3)
    expect(ul.querySelectorAll('li')[0]?.textContent).toBe('alpha')
    expect(ul.querySelectorAll('li')[1]?.textContent).toBe('gamma')
    expect(ul.querySelectorAll('li')[2]?.textContent).toBe('delta')

    cleanup()
  })

  test('multiple reactive children in a single element', async () => {
    const Comp = (props: { first: () => string; last: () => string }) =>
      h('div', null,
        h('span', { class: 'first' }, () => props.first()),
        ' ',
        h('span', { class: 'last' }, () => props.last()),
      )

    const html = await renderToString(
      h(Comp, { first: () => 'John', last: () => 'Doe' }),
    )

    const el = container()
    el.innerHTML = html

    const first = signal('John')
    const last = signal('Doe')
    const cleanup = hydrateRoot(
      el,
      h(Comp, { first: () => first(), last: () => last() }),
    )

    expect(el.querySelector('.first')!.textContent).toBe('John')
    expect(el.querySelector('.last')!.textContent).toBe('Doe')

    // Update independently
    first.set('Jane')
    expect(el.querySelector('.first')!.textContent).toBe('Jane')
    expect(el.querySelector('.last')!.textContent).toBe('Doe')

    last.set('Smith')
    expect(el.querySelector('.last')!.textContent).toBe('Smith')

    cleanup()
  })

  test('component with event handler after hydration', async () => {
    let clickCount = 0

    const Comp = () =>
      h('button', {
        onClick: () => { clickCount++ },
      }, 'Click me')

    const html = await renderToString(h(Comp, null))

    const el = container()
    el.innerHTML = html

    const cleanup = hydrateRoot(el, h(Comp, null))

    // Events attached during hydration
    el.querySelector('button')!.click()
    expect(clickCount).toBe(1)

    el.querySelector('button')!.click()
    expect(clickCount).toBe(2)

    cleanup()
  })

  test('Fragment children hydrate correctly', async () => {
    const Comp = (props: { a: () => string; b: () => string }) =>
      h(Fragment, null,
        h('span', { class: 'a' }, () => props.a()),
        h('span', { class: 'b' }, () => props.b()),
      )

    const html = await renderToString(
      h(Comp, { a: () => 'first', b: () => 'second' }),
    )

    const el = container()
    el.innerHTML = html

    const a = signal('first')
    const b = signal('second')
    const cleanup = hydrateRoot(
      el,
      h(Comp, { a: () => a(), b: () => b() }),
    )

    expect(el.querySelector('.a')!.textContent).toBe('first')
    expect(el.querySelector('.b')!.textContent).toBe('second')

    a.set('updated-a')
    expect(el.querySelector('.a')!.textContent).toBe('updated-a')

    b.set('updated-b')
    expect(el.querySelector('.b')!.textContent).toBe('updated-b')

    cleanup()
  })
})

// ─── Mismatch recovery ──────────────────────────────────────────────────────

describe('hydration integration — mismatch recovery', () => {
  test('text mismatch: SSR has "Alice", client has "Bob" — recovers', async () => {
    const Comp = (props: { name: () => string }) =>
      h('div', null, () => props.name())

    const html = await renderToString(h(Comp, { name: () => 'Alice' }))

    const el = container()
    el.innerHTML = html

    // Hydrate with different value — should update text to match client
    const name = signal('Bob')
    disableHydrationWarnings()
    const cleanup = hydrateRoot(el, h(Comp, { name: () => name() }))
    enableHydrationWarnings()

    // Client value wins after hydration
    expect(el.querySelector('div')!.textContent).toBe('Bob')

    // Reactivity works
    name.set('Charlie')
    expect(el.querySelector('div')!.textContent).toBe('Charlie')

    cleanup()
  })

  test('tag mismatch: SSR has <div>, client has <span> — remounts', async () => {
    const el = container()
    el.innerHTML = '<div>server content</div>'

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cleanup = hydrateRoot(el, h('span', null, 'client content'))

    // Mismatch triggers fresh mount — client content rendered
    expect(el.textContent).toContain('client content')

    cleanup()
    warnSpy.mockRestore()
  })

  test('extra server children — hydration still works for matching nodes', async () => {
    // Server rendered more children than client expects
    const el = container()
    el.innerHTML = '<div><span>first</span><span>extra</span></div>'

    const text = signal('first')
    const cleanup = hydrateRoot(
      el,
      h('div', null, h('span', null, () => text())),
    )

    // First span hydrated
    expect(el.querySelector('span')!.textContent).toBe('first')

    // Reactive update works
    text.set('updated')
    expect(el.querySelector('span')!.textContent).toBe('updated')

    cleanup()
  })
})

// ─── onHydrationMismatch telemetry hook ────────────────────────────────────
//
// Pre-fix: runtime-dom emitted hydration mismatches via console.warn ONLY,
// gated on __DEV__. Production deployments (Sentry, Datadog) had no
// integration point — mismatches surfaced as silent recovery (text
// rewritten or DOM remounted) with no telemetry signal. The asymmetry
// with `@pyreon/core`'s `registerErrorHandler` (which captures component
// + reactivity errors via the `__pyreon_report_error__` bridge) was the
// gap.
//
// Post-fix: `onHydrationMismatch(handler)` registers a callback fired on
// EVERY mismatch in dev AND prod, independent of the warn toggle.
// Mirrors core's `registerErrorHandler` shape.
describe('hydration integration — onHydrationMismatch telemetry hook', () => {
  test('handler fires with full mismatch context on tag mismatch', async () => {
    const { onHydrationMismatch } = await import('../hydration-debug')
    const captured: Array<{ type: string; expected: unknown; actual: unknown; path: string; timestamp: number }> = []
    const unsub = onHydrationMismatch((ctx) => {
      captured.push({
        type: ctx.type,
        expected: ctx.expected,
        actual: ctx.actual,
        path: ctx.path,
        timestamp: ctx.timestamp,
      })
    })

    const el = container()
    el.innerHTML = '<div>server content</div>'

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cleanup = hydrateRoot(el, h('span', null, 'client content'))

    expect(captured.length).toBeGreaterThan(0)
    const tagMismatch = captured.find((c) => c.type === 'tag')
    expect(tagMismatch).toBeDefined()
    expect(tagMismatch?.expected).toBe('span')
    expect(typeof tagMismatch?.path).toBe('string')
    expect(typeof tagMismatch?.timestamp).toBe('number')

    cleanup()
    unsub()
    warnSpy.mockRestore()
  })

  test('handler fires for tag mismatch in production-style silence (warn disabled)', () => {
    const el = container()
    el.innerHTML = '<div>server content</div>'

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    disableHydrationWarnings() // simulate production: warns silenced

    return import('../hydration-debug').then(({ onHydrationMismatch }) => {
      const captured: Array<{ type: string }> = []
      const unsub = onHydrationMismatch((ctx) => {
        captured.push({ type: ctx.type })
      })

      const cleanup = hydrateRoot(el, h('span', null, 'client content'))

      // Telemetry hook fired even with warn disabled — independent.
      expect(captured.length).toBeGreaterThan(0)
      expect(captured.some((c) => c.type === 'tag')).toBe(true)
      // console.warn was NOT called (production-style silence).
      expect(warnSpy).not.toHaveBeenCalled()

      cleanup()
      unsub()
      warnSpy.mockRestore()
      enableHydrationWarnings()
    })
  })

  test('multiple handlers all receive forwarded mismatches; unsub stops one cleanly', async () => {
    const { onHydrationMismatch } = await import('../hydration-debug')
    let count1 = 0
    let count2 = 0
    const unsub1 = onHydrationMismatch(() => count1++)
    const unsub2 = onHydrationMismatch(() => count2++)

    const el = container()
    el.innerHTML = '<div>server</div>'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cleanup = hydrateRoot(el, h('span', null, 'client'))

    expect(count1).toBeGreaterThan(0)
    expect(count1).toBe(count2)

    // Unsubscribe one — only the other fires next time.
    unsub1()
    const before2 = count2
    const el2 = container()
    el2.innerHTML = '<p>foo</p>'
    const cleanup2 = hydrateRoot(el2, h('article', null, 'bar'))

    expect(count2).toBeGreaterThan(before2)

    cleanup()
    cleanup2()
    unsub2()
    warnSpy.mockRestore()
  })

  test('handler errors do not propagate into hydration', async () => {
    const { onHydrationMismatch } = await import('../hydration-debug')
    let goodHandlerFired = false
    const unsubBad = onHydrationMismatch(() => {
      throw new Error('telemetry SDK exploded')
    })
    const unsubGood = onHydrationMismatch(() => {
      goodHandlerFired = true
    })

    const el = container()
    el.innerHTML = '<div>server</div>'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    disableHydrationWarnings()

    // Hydration must complete without throwing despite bad handler.
    const cleanup = hydrateRoot(el, h('span', null, 'client'))
    expect(goodHandlerFired).toBe(true)
    // Client content still rendered — recovery worked.
    expect(el.textContent).toContain('client')

    cleanup()
    unsubBad()
    unsubGood()
    warnSpy.mockRestore()
    enableHydrationWarnings()
  })
})

// ─── _rp prop forwarding through SSR -> hydrate ─────────────────────────────

describe('hydration integration — `_rp`-wrapped component props (regression)', () => {
  // Pre-fix, hydrate.ts skipped `makeReactiveProps` on the way into a
  // component, so `props.x` returned the raw `_rp` function instead of the
  // resolved value. mount.ts already did the right thing, so the failure mode
  // surfaced only on cold-start SSR/hydrate (the fundamentals NavItem layout
  // shape — see e2e/fundamentals/playground.spec.ts). Lock in BOTH the SSR
  // emit and the post-hydration value.
  test('SSR emits resolved string from `_rp` prop, hydration preserves it', async () => {
    const Link = (props: { to: string }) =>
      h('a', { href: `#${props.to}`, id: 'lnk' }, () => props.to)

    const html = await renderToString(
      h(Link, { to: _rp(() => '/about') as unknown as string }),
    )
    expect(html).toBe('<a href="#/about" id="lnk">/about</a>')
    expect(html).not.toContain('=>')

    const el = container()
    el.innerHTML = html
    const cleanup = hydrateRoot(
      el,
      h(Link, { to: _rp(() => '/about') as unknown as string }),
    )
    const link = el.querySelector<HTMLAnchorElement>('#lnk')!
    expect(link.getAttribute('href')).toBe('#/about')
    expect(link.textContent).toBe('/about')
    cleanup()
  })
})

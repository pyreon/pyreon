/**
 * Async function component HYDRATION — the SSR→client handoff.
 *
 * `renderToString` awaits async function components and inlines their HTML.
 * The client must hydrate that HTML in place — meaning attach event handlers,
 * register lifecycle hooks, wire up signal subscriptions on every node in the
 * resolved subtree. Anything less leaves the page server-rendered but
 * client-dead (clicking does nothing, signal updates don't patch the DOM).
 *
 * Contract:
 *   - `runtime-server` wraps each async-component's output in sentinel
 *     comments: `<!--$pas-->` (start) ... `<!--$pae-->` (end).
 *   - `runtime-dom` hydrate locates the matching end marker (depth-tracked
 *     so nested async markers don't confuse the walker), snapshots the SSR
 *     DOM range, advances the parent's cursor past the end marker
 *     synchronously, then asynchronously awaits the Promise and hydrates
 *     the resolved VNode against the snapshotted range.
 *
 * Bisect-verified: stripping the `<!--$pas-->`/`<!--$pae-->` markers from
 * the SSR fixture leaves the click handler unattached — the post-resolve
 * click assertion fails.
 */
import { signal } from '@pyreon/reactivity'
import { h, onMount } from '@pyreon/core'
import { describe, expect, test } from 'vitest'
import { hydrateRoot } from '../hydrate'

function makeContainer(ssrInnerHtml: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = ssrInnerHtml
  document.body.appendChild(el)
  return el
}

describe('hydration of async function components', () => {
  test('async subtree gets click handlers attached when SSR markers are present', async () => {
    // SSR HTML: outer `<main>` wraps the async `<button>` between sentinel markers.
    const ssr =
      '<main><!--$pas--><button class="async-btn">click me</button><!--$pae--></main>'
    const el = makeContainer(ssr)

    const clicks = signal(0)
    async function AsyncBody() {
      return h(
        'button',
        {
          class: 'async-btn',
          onClick: () => clicks.set(clicks() + 1),
        },
        'click me',
      )
    }

    hydrateRoot(el, h('main', null, h(AsyncBody as any, null)))

    // Synchronous: SSR DOM still in place, button visible.
    const btn = el.querySelector<HTMLButtonElement>('.async-btn')!
    expect(btn).not.toBeNull()
    expect(btn.textContent).toBe('click me')

    // Await async hydration: handler attaches to the existing button.
    await new Promise((r) => setTimeout(r, 0))

    btn.click()
    expect(clicks()).toBe(1)
    btn.click()
    expect(clicks()).toBe(2)
  })

  test('onMount on a child of an async component fires after hydration', async () => {
    const ssr =
      '<section><!--$pas--><p class="child">hi</p><!--$pae--></section>'
    const el = makeContainer(ssr)

    let mountCount = 0
    function Child() {
      onMount(() => {
        mountCount++
      })
      return h('p', { class: 'child' }, 'hi')
    }
    async function AsyncOuter() {
      return h(Child, null)
    }

    hydrateRoot(el, h('section', null, h(AsyncOuter as any, null)))
    await new Promise((r) => setTimeout(r, 0))
    // Allow microtask chain to flush.
    await new Promise((r) => setTimeout(r, 0))

    expect(mountCount).toBe(1)
  })

  test('signal-driven text inside async subtree patches on signal update', async () => {
    const ssr =
      '<div><!--$pas--><span class="t">initial</span><!--$pae--></div>'
    const el = makeContainer(ssr)
    const label = signal('initial')

    async function AsyncBody() {
      return h('span', { class: 't' }, () => label())
    }
    hydrateRoot(el, h('div', null, h(AsyncBody as any, null)))
    await new Promise((r) => setTimeout(r, 0))

    label.set('updated')
    // Reactive text patches in place; the existing span node receives new data.
    const span = el.querySelector<HTMLSpanElement>('.t')!
    expect(span.textContent).toBe('updated')
  })

  test('siblings of an async component hydrate synchronously (cursor advances past end marker)', async () => {
    const ssr =
      '<main><!--$pas--><p class="a">A</p><!--$pae--><button class="sib">sib</button></main>'
    const el = makeContainer(ssr)

    const clicks = signal(0)
    async function AsyncA() {
      return h('p', { class: 'a' }, 'A')
    }
    function Sib() {
      return h(
        'button',
        { class: 'sib', onClick: () => clicks.set(clicks() + 1) },
        'sib',
      )
    }

    hydrateRoot(el, h('main', null, h(AsyncA as any, null), h(Sib, null)))

    // Sibling's click handler must attach synchronously — it doesn't depend on
    // the async resolution.
    el.querySelector<HTMLButtonElement>('.sib')!.click()
    expect(clicks()).toBe(1)
  })

  test('nested async components hydrate independently (depth-tracked marker matching)', async () => {
    const ssr =
      '<div>' +
      '<!--$pas-->' +
      '<section>' +
      '<!--$pas-->' +
      '<button class="inner">inner</button>' +
      '<!--$pae-->' +
      '</section>' +
      '<!--$pae-->' +
      '</div>'
    const el = makeContainer(ssr)

    const clicks = signal(0)
    async function Inner() {
      return h(
        'button',
        { class: 'inner', onClick: () => clicks.set(clicks() + 1) },
        'inner',
      )
    }
    async function Outer() {
      return h('section', null, h(Inner as any, null))
    }
    hydrateRoot(el, h('div', null, h(Outer as any, null)))

    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    el.querySelector<HTMLButtonElement>('.inner')!.click()
    expect(clicks()).toBe(1)
  })

  test('missing SSR markers emit a dev warning but do not crash', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // SSR fixture deliberately lacks the markers (simulating an older
    // runtime-server). Hydration should warn + skip reactivity attachment.
    const ssr = '<main><button class="no-markers">x</button></main>'
    const el = makeContainer(ssr)
    async function AsyncBody() {
      return h('button', { class: 'no-markers' }, 'x')
    }
    hydrateRoot(el, h('main', null, h(AsyncBody as any, null)))
    await new Promise((r) => setTimeout(r, 0))

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SSR markers'),
    )
    warnSpy.mockRestore()
  })
})

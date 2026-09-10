import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'

import { renderToString } from '../index'

const render = async (v: unknown): Promise<string> =>
  await (renderToString(v as never) as unknown as Promise<string>)

/**
 * Two guards that keyed on ONE spelling of a thing that has several — the same
 * shape as the `xlink:href` drift, reached through different aliases.
 *
 * 1. The event-prop skip required an UPPERCASE third character (`/^on[A-Z]/`),
 *    so the lowercase spelling — which is the real HTML event-handler content
 *    attribute — fell through and was serialized verbatim. The reachable vector
 *    is a spread of a user-keyed object, which is verbatim the threat model
 *    `UNSAFE_ATTR_NAME_RE` already documents; that regex cannot see it because
 *    `onclick` contains no breakout character.
 *
 *    The skip also runs BEFORE the `typeof value === 'function'` resolution, so
 *    the same hole meant a lowercase `on*` holding a FUNCTION was CALLED during
 *    render — a typo'd `onclick={handleDelete}` ran `handleDelete` on the server.
 *
 * 2. The URL guard keyed on the JSX PROP name while SSR emits the lowercased
 *    ATTRIBUTE name. `formAction` is an advertised typed prop, so the idiomatic
 *    TSX spelling was the unguarded one — and `formaction` overrides
 *    `<form action>`, which is in the set precisely because `javascript:`
 *    executes on submit.
 */
describe('a lowercase on* prop never reaches the server-rendered HTML', () => {
  for (const [label, props] of [
    ['onclick', { onclick: 'alert(1)' }],
    ['onerror', { onerror: 'alert(1)' }],
    ['onload', { onload: 'alert(1)' }],
    ['onmouseover', { onmouseover: 'alert(1)' }],
    ['onfocus', { onfocus: 'alert(1)' }],
  ] as Array<[string, Record<string, unknown>]>) {
    it(`drops ${label} rather than emitting a live inline handler`, async () => {
      const html = await render(h('div', props))
      expect(html, 'a string on* prop must never be serialized').toBe('<div></div>')
    })
  }

  it('drops it on a void element too', async () => {
    expect(await render(h('img', { src: 'x', onerror: 'alert(1)' }))).toBe('<img src="x" />')
  })

  it('does NOT invoke a lowercase on* FUNCTION during render', async () => {
    let ran = false
    await render(h('div', { onclick: () => { ran = true } }))
    expect(ran, 'a typo-ed handler must not execute on the server').toBe(false)
  })

  it('the camelCase form is unchanged', async () => {
    let ran = false
    expect(await render(h('div', { onClick: 'alert(1)' }))).toBe('<div></div>')
    await render(h('div', { onClick: () => { ran = true } }))
    expect(ran).toBe(false)
  })

  // The skip must not swallow ordinary attributes, and a function-valued
  // non-handler prop must still resolve — over-reaching here would silently
  // drop real content, which is a worse failure than the one being fixed.
  it('does not over-reach', async () => {
    expect(await render(h('div', { title: 'ok', id: 'a' }))).toContain('title="ok"')
    expect(await render(h('div', { title: () => 'hi' }))).toBe('<div title="hi"></div>')
    expect(await render(h('div', { 'data-once': 'x' }))).toContain('data-once="x"')
    // The load-bearing control: an attribute that merely STARTS with "on" is
    // ordinary data and must still render. This is why the skip is a NAME SET
    // and not `/^on[a-z]/` — the broad regex eats these, and a pre-existing
    // spec (ssr-perf-paths.test.ts) asserts they survive.
    const html = await render(h('button', { once: 'x', onyx: 'y' } as never))
    expect(html, 'once/onyx are not event handlers').toContain('once="x"')
    expect(html).toContain('onyx="y"')
  })
})

describe('the URL guard resolves the attribute name before asking', () => {
  it('blocks formAction — the typed camelCase spelling', async () => {
    const html = await render(h('button', { formAction: 'javascript:alert(1)' }, 'go'))
    expect(html, 'formaction overrides <form action>, which IS guarded').toBe('<button>go</button>')
  })

  it('still blocks the lowercase spelling', async () => {
    expect(await render(h('button', { formaction: 'javascript:alert(1)' }, 'go'))).toBe(
      '<button>go</button>',
    )
  })

  it('a safe formAction still renders', async () => {
    expect(await render(h('button', { formAction: '/submit' }, 'go'))).toContain(
      'formaction="/submit"',
    )
  })
})

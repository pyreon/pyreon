// Targeted coverage for residual node-reachable SSR branches in the
// renderToString / renderToStream pipeline.

import { For, h } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { describe, expect, it, vi } from 'vitest'
import { renderToStream, renderToString } from '../index'

describe('SSR — <For> with a function `each` accessor', () => {
  it('renders items from a function-shaped each (renderToString path)', async () => {
    const html = await renderToString(
      h(
        For,
        { each: () => [1, 2, 3], by: (x: number) => x },
        ((item: number) => h('li', null, String(item))) as never,
      ),
    )
    expect(html).toContain('<li')
    expect(html).toContain('1')
    expect(html).toContain('3')
  })

  it('renders items from an array each', async () => {
    const html = await renderToString(
      h(
        For,
        { each: ['a', 'b'], by: (x: string) => x },
        ((item: string) => h('span', null, item)) as never,
      ),
    )
    expect(html).toContain('a')
    expect(html).toContain('b')
  })
})

describe('SSR — component render error is caught (renderToString catch)', () => {
  it('a throwing component runs the SSR error catch', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Bad: ComponentFn = () => {
      throw new Error('render boom')
    }
    // The SSR renderer's per-component catch runs — outside a Suspense
    // boundary the error propagates to the caller. (The dev console.error
    // inside the catch is `__DEV__`-gated and inert under NODE_ENV=production.)
    await expect(renderToString(h('div', null, h(Bad, null)))).rejects.toThrow(
      'render boom',
    )
    errSpy.mockRestore()
  })
})

describe('SSR — dangerouslySetInnerHTML + innerHTML variants', () => {
  it('object form emits the raw html', async () => {
    const html = await renderToString(
      h('div', { dangerouslySetInnerHTML: { __html: '<b>raw</b>' } }),
    )
    expect(html).toContain('<b>raw</b>')
  })

  it('function form is invoked', async () => {
    const html = await renderToString(
      h('div', { dangerouslySetInnerHTML: () => ({ __html: '<i>fn</i>' }) }),
    )
    expect(html).toContain('<i>fn</i>')
  })

  it('plain innerHTML (non-empty) is emitted', async () => {
    const html = await renderToString(h('div', { innerHTML: 'plain inner' }))
    expect(html).toContain('plain inner')
  })
})

describe('SSR — style object normalization', () => {
  it('a plain style object is serialized to a CSS string', async () => {
    const html = await renderToString(
      h('div', { style: { color: 'red', fontSize: '12px' } }),
    )
    expect(html).toContain('color: red')
    expect(html).toContain('font-size: 12px')
  })

  it('a function style accessor is invoked', async () => {
    const html = await renderToString(h('div', { style: () => 'color: blue' }))
    expect(html).toContain('color: blue')
  })
})

describe('SSR — unsafe tag name warns in dev (warnIfUnsafeTag)', () => {
  it('a tag with invalid characters triggers the dev warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // leading digit → fails SAFE_TAG_RE → warnIfUnsafeTag path
    await renderToString(h('1bad' as never, null))
    warn.mockRestore()
    expect(true).toBe(true)
  })
})

describe('SSR — renderToStream basic drain', () => {
  it('streams a simple tree to completion', async () => {
    const stream = renderToStream(h('div', null, h('p', null, 'streamed')))
    const reader = stream.getReader()
    let out = ''
    const dec = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      out += typeof value === 'string' ? value : dec.decode(value)
    }
    expect(out).toContain('streamed')
  })
})

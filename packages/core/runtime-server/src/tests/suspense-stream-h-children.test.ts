/**
 * `h(Suspense, { fallback }, child)` carries its child in `vnode.children`,
 * not `props.children`. The stream read `vnode.props` only, so every h()-built
 * boundary streamed an EMPTY `<template>` and the swap replaced the fallback
 * with nothing (the string renderer merged children and was correct).
 */
import { Suspense, h } from '@pyreon/core'
import { renderToStream } from '../index'

async function read(s: ReadableStream<string>): Promise<string> {
  const r = s.getReader()
  let out = ''
  for (;;) {
    const { value, done } = await r.read()
    if (done) return out
    out += value
  }
}

describe('streamed Suspense — h() children', () => {
  it('streams the resolved child into the swap template', async () => {
    async function Slow(): Promise<ReturnType<typeof h>> {
      await new Promise((r) => setTimeout(r, 5))
      return h('p', null, 'slow')
    }
    const html = await read(
      renderToStream(h('div', null, h(Suspense, { fallback: h('i', null, 'fb') }, h(Slow, null)))),
    )
    expect(html).toMatch(/<template id="pyreon-t-0">.*slow.*<\/template>/)
  })
})

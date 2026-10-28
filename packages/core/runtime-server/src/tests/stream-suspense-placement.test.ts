// @vitest-environment happy-dom
//
// A streamed `<Suspense>` boundary's swap must find its target. The renderer can hold HTML back from the document —
// a `<For>` component row is buffered until its key-marker decision is known, and a boundary's resolved children are
// buffered until its `<template>` is emitted — while boundary resolution runs concurrently. The boundary's wrapper
// `<div>` used to go straight to the main stream, so inside a buffered row it landed EMPTY and OUTSIDE the row, with
// the fallback inside: the swap put the resolved content beside the row and the fallback stayed forever. A boundary
// nested in another boundary had the same defect (that one predates 0.54).
//
// The oracle is a browser: each `__NS` swap runs when its script is parsed, after every earlier swap, and must find
// both its target and its template; once all have run, the document must equal `renderToString` of the same tree.

import { For, h, Suspense, type VNodeChild } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { renderToStream, renderToString } from '../index'

async function read(stream: ReadableStream<string>): Promise<string> {
  let out = ''
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out += value
  }
}

const parse = (html: string): Document => {
  const d = document.implementation.createHTMLDocument('')
  d.body.innerHTML = html
  return d
}

function runSwap(d: Document, target: string, template: string): void {
  const el = d.getElementById(target)
  const tpl = d.getElementById(template) as HTMLTemplateElement | null
  if (el && tpl) {
    el.replaceWith(tpl.content.cloneNode(true))
    tpl.remove()
  }
}

const normalize = (d: Document): string => {
  for (const s of d.querySelectorAll('script, style')) s.remove()
  return d.body.innerHTML.replace(/<!--[^>]*-->/g, '')
}

/** Apply a streamed document the way a browser does, reporting any swap that ran before its target existed. */
function applyStream(html: string): { dom: string; problems: string[] } {
  const problems: string[] = []
  const swaps: [string, string][] = []
  for (const m of html.matchAll(/<script[^>]*>__NS\("([^"]+)","([^"]+)"\)<\/script>/g)) {
    const atThatPoint = parse(html.slice(0, m.index))
    for (const [s, t] of swaps) runSwap(atThatPoint, s, t)
    if (!atThatPoint.getElementById(m[1]!)) problems.push(`${m[1]} was not in the document when its swap ran`)
    if (!atThatPoint.getElementById(m[2]!)) problems.push(`${m[2]} was not in the document when its swap ran`)
    swaps.push([m[1]!, m[2]!])
  }
  const d = parse(html)
  for (const [s, t] of swaps) runSwap(d, s, t)
  return { dom: normalize(d), problems }
}

const after = (ms: number, text: string) => async () => {
  await new Promise((r) => setTimeout(r, ms))
  return h('b', null, text)
}
const fast = after(1, 'fast')
const slow = after(30, 'slow')
const boundary = (child: () => Promise<VNodeChild>, wait = 'wait') =>
  h(Suspense, { fallback: h('i', null, wait) }, h(child as never, null))

const SHAPES: Record<string, () => VNodeChild> = {
  'a component row of <For> holding a boundary': () => {
    const Row = () => h('li', null, boundary(fast))
    return h('ul', null, h(For, { each: [1, 2], by: (n: number) => n }, () => h(Row, null)))
  },
  'a buffered row whose boundary resolves while the row is still streaming': () => {
    const Row = () => h('li', null, boundary(fast), h(slow as never, null))
    return h('ul', null, h(For, { each: [1], by: (n: number) => n }, () => h(Row, null)))
  },
  'a boundary nested inside another boundary': () =>
    h('div', null, h(Suspense, { fallback: h('i', null, 'outer') }, h('section', null, h(slow as never, null), boundary(fast, 'inner')))),
  'a nested boundary that resolves before the boundary around it': () =>
    h('div', null, h(Suspense, { fallback: h('i', null, 'outer') }, h('section', null, boundary(fast, 'inner'), h(slow as never, null)))),
  'a boundary in a row nested inside another boundary': () => {
    const Row = () => h('li', null, boundary(fast))
    return h(Suspense, { fallback: h('i', null, 'outer') }, h('ul', null, h(slow as never, null), h(For, { each: [1, 2], by: (n: number) => n }, () => h(Row, null))))
  },
}

describe('streamed <Suspense> boundaries land where they were written', () => {
  for (const [label, tree] of Object.entries(SHAPES)) {
    it(label, async () => {
      const { dom, problems } = applyStream(await read(renderToStream(tree() as never)))
      expect(problems).toEqual([])
      expect(dom).toBe(normalize(parse(await renderToString(tree() as never))))
    })
  }
})

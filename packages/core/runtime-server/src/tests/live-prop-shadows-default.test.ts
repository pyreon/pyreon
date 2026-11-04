import { h } from '@pyreon/core'
import { renderToStream, renderToString } from '../index'

// A live prop and its default share ONE content attribute. Emitting both
// (`value="def" value="cur"`) is parser-first-wins, so the default showed.
// The live prop wins whenever it is non-nullish; a nullish one leaves the
// default in place.
async function streamed(node: ReturnType<typeof h>): Promise<string> {
  const reader = renderToStream(node).getReader()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out += value
  }
}

const cases: [string, () => ReturnType<typeof h>, string][] = [
  ['value after defaultValue', () => h('input', { defaultValue: 'def', value: 'cur' }), '<input value="cur" />'],
  ['value before defaultValue', () => h('input', { value: 'cur', defaultValue: 'def' }), '<input value="cur" />'],
  ['accessor value', () => h('input', { defaultValue: 'def', value: () => 'cur' }), '<input value="cur" />'],
  ['nullish value keeps the default', () => h('input', { defaultValue: 'def', value: null }), '<input value="def" />'],
  ['checked={false} over defaultChecked', () => h('input', { defaultChecked: true, checked: false }), '<input />'],
  ['muted={false} over defaultMuted (video)', () => h('video', { defaultMuted: true, muted: false }), '<video></video>'],
  ['muted over defaultMuted (audio)', () => h('audio', { defaultMuted: false, muted: true }), '<audio muted></audio>'],
  ['an unrelated prop is untouched', () => h('p', { title: 'x' }), '<p title="x"></p>'],
]

describe('SSR: a live prop shadows its default', () => {
  for (const [name, make, html] of cases) {
    test(`${name} (string)`, async () => {
      expect(await renderToString(make())).toBe(html)
    })
    test(`${name} (stream)`, async () => {
      expect(await streamed(make())).toBe(html)
    })
  }
})

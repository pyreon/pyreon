import { h } from '@pyreon/core'
import { renderToString } from '../index'

// `escapeHtml` gates on a regex `test`, then starts its charCode loop at the
// first special character (`search`) instead of index 0. Lock its output
// against an independent reference for text children and attribute values,
// across seeded strings with specials at the start, middle, end, in runs, or
// nowhere.
const ref = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

describe('escapeHtml — differential vs a reference escaper', () => {
  it('text + attribute escaping matches for 5,000 seeded strings', async () => {
    const alpha = ['a', 'b', ' ', '&', '<', '>', '"', "'", 'é', '😀', '&amp;']
    let seed = 11
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let t = 0; t < 5000; t++) {
      let s = ''
      const len = 1 + Math.floor(rnd() * 24)
      for (let k = 0; k < len; k++) s += alpha[Math.floor(rnd() * alpha.length)]
      expect(await renderToString(h('p', null, s)), s).toBe(`<p>${ref(s)}</p>`)
      expect(await renderToString(h('p', { title: s })), s).toBe(`<p title="${ref(s)}"></p>`)
    }
  })
})

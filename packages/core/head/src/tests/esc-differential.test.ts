import { serializeHead } from '../ssr'

// `esc` starts its charCode loop at the first special character found by a
// regex `search` (a pure loop from index 0 paid a JS step per clean char).
// Lock its output against an independent reference across seeded strings that
// put specials at the start, middle, end, in runs, or nowhere.
const ref = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

describe('head esc — differential vs a reference escaper', () => {
  it('title + attribute escaping matches for 5,000 seeded strings', () => {
    const alpha = ['a', 'b', ' ', '&', '<', '>', '"', "'", 'é', '😀', '&amp;', '\n']
    let seed = 7
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let t = 0; t < 5000; t++) {
      let s = ''
      const len = Math.floor(rnd() * 24)
      for (let k = 0; k < len; k++) s += alpha[Math.floor(rnd() * alpha.length)]
      expect(serializeHead([{ tag: 'title', children: s }]), s).toBe(`<title>${ref(s)}</title>`)
      expect(serializeHead([{ tag: 'meta', props: { content: s } }]), s).toBe(`<meta content="${ref(s)}" />`)
    }
  })
})

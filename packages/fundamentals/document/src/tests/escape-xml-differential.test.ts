import { escapeXml } from '../sanitize'

// escapeXml starts its charCode loop at the first special (`search`). Lock its
// output against an independent reference over seeded strings. Document's
// entity set is `& < > "` only — `'` stays literal.
const ref = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

describe('escapeXml — differential vs a reference escaper', () => {
  it('matches for 5,000 seeded strings', () => {
    const alpha = ['a', 'b', ' ', '&', '<', '>', '"', "'", 'é', '😀', '&amp;', '\n']
    let seed = 13
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let t = 0; t < 5000; t++) {
      let s = ''
      const len = Math.floor(rnd() * 24)
      for (let k = 0; k < len; k++) s += alpha[Math.floor(rnd() * alpha.length)]
      expect(escapeXml(s), s).toBe(ref(s))
    }
  })
})

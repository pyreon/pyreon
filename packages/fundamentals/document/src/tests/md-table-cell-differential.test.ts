import { Document, Table, render } from '../index'

// mdTableCell returns a cell unchanged when it holds none of the characters
// it rewrites, skipping both replace passes. Lock the output against the
// unconditional reference (escape inline markup, then line breaks → <br>).
const ref = (s: string) => s.replace(/[\\`*_~[\]<>&|]/g, '\\$&').replace(/\r\n|\r|\n/g, '<br>')

describe('md table cell — differential vs the unconditional escape', () => {
  it('matches for 3,000 seeded cells', async () => {
    const alpha = ['a', 'b', ' ', '\\', '`', '*', '_', '~', '[', ']', '<', '>', '&', '|', '\n', '\r', '\r\n', '#', 'é', '😀']
    let seed = 17
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let t = 0; t < 3000; t++) {
      let s = 'x'
      const len = Math.floor(rnd() * 16)
      for (let k = 0; k < len; k++) s += alpha[Math.floor(rnd() * alpha.length)]
      const md = await render(Document({ children: [Table({ columns: ['H'], rows: [[s]] })] }), 'md')
      expect(md, JSON.stringify(s)).toBe(`| H |\n| --- |\n| ${ref(s)} |\n`)
    }
  })
})

// Differential fuzz: the run-slicing normalizeCSS must be BYTE-IDENTICAL to the
// original per-char implementation on every input. `normalizeOld` is a verbatim
// copy of the pre-rewrite body — the rewrite is only an allocation optimization,
// so any divergence is a bug. This is the load-bearing proof for the rewrite.
import { describe, expect, it } from 'vitest'
import { normalizeCSS } from '../resolve'

function normalizeOld(css: string): string {
  const len = css.length
  let out = ''
  let space = false
  let last = 0
  for (let i = 0; i < len; i++) {
    const c = css.charCodeAt(i)
    if (c === 47 && css.charCodeAt(i + 1) === 42) {
      const end = css.indexOf('*/', i + 2)
      i = end === -1 ? len : end + 1
      space = true
      continue
    }
    if (c === 47 && css.charCodeAt(i + 1) === 47 && last !== 58) {
      const nl = css.indexOf('\n', i + 2)
      i = nl === -1 ? len : nl
      space = true
      continue
    }
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) {
      space = true
      continue
    }
    if (c === 59) {
      if (last === 0 || last === 123 || last === 125 || last === 59) continue
      space = false
      out += ';'
      last = 59
      continue
    }
    if (space && last !== 0) out += ' '
    space = false
    out += css[i]
    last = c
  }
  return out
}

// Deterministic PRNG (no Math.random — it is unavailable in some repo contexts)
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const ALPHABET = [
  'color', 'red', 'blue', ':', ';', ' ', '  ', '\t', '\n', '\r', '\f', '{', '}',
  '/* c */', '// line\n', 'https://x.test/y', 'url(//h/a)', 'a:b', '.cls',
  'background', '#fff', 'rgb(1,2,3)', '10px', 'calc(1px + 2%)', '  ;  ', ';;',
  '{;', '};', 'margin:0;;', 'a  b', ' \t\n leading', 'trailing \n ', '',
]

describe('normalizeCSS — differential fuzz vs original', () => {
  it('is byte-identical to the original on hand-picked edge cases', () => {
    const cases = [
      '', '   ', 'color:red', 'color: red', 'color:  red',
      'a{color:red;}', 'a {\n  color: red;\n}', ';;;', 'a;;b', '{;}', '}; ',
      '/* x */color:red', 'color:red/* y */', 'a// c\nb', 'a:// not comment\nb',
      'url(https://x.test)', 'x:url(//h)', 'a  ;  b', ' ; ', 'margin: 0 ;',
      '\t\n\r\f', 'a\tb\nc', 'trailing ;  ',
    ]
    for (const c of cases) expect(normalizeCSS(c)).toBe(normalizeOld(c))
  })

  it('is byte-identical to the original on 20000 random inputs', () => {
    const rng = makeRng(0xC0FFEE)
    for (let n = 0; n < 20000; n++) {
      const parts = 1 + Math.floor(rng() * 14)
      let str = ''
      for (let k = 0; k < parts; k++) str += ALPHABET[Math.floor(rng() * ALPHABET.length)]
      expect(normalizeCSS(str)).toBe(normalizeOld(str))
    }
  })
})

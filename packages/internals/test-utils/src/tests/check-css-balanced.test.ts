import { describe, expect, it } from 'vitest'
import { cssBalanceProblems } from '../../../../../scripts/check-css-balanced'

describe('cssBalanceProblems', () => {
  it('passes a balanced stylesheet with nested at-rules', () => {
    const css =
      '@media print {\n  .a {\n    color: red;\n  }\n}\n@keyframes k {\n  from { opacity: 0 }\n}\n'
    expect(cssBalanceProblems(css)).toEqual([])
  })

  it('flags the shape @pyreon/calendar shipped: a print block cut before its closing braces', () => {
    const css = [
      '.pcal { color: red; }',
      '@media print {',
      '  .pcal-event {',
      '    box-shadow: none;',
      '',
      '.pcal-tl-nowarea {',
      '  position: absolute;',
      '}',
    ].join('\n')
    const problems = cssBalanceProblems(css)
    expect(problems).toHaveLength(1)
    // Reported at the outermost block left open: where the cut is.
    expect(problems[0]?.line).toBe(2)
    expect(problems[0]?.message).toMatch(/2 block\(s\) still open/)
  })

  it('flags a stray closing brace', () => {
    expect(cssBalanceProblems('.a { color: red; } }\n')[0]?.message).toMatch(/never opened/)
  })

  it('ignores braces inside comments and strings', () => {
    const css =
      '/* { not a block */\n.a::before { content: "}{"; }\n.b { background: url(\'a{b}.png\'); }\n'
    expect(cssBalanceProblems(css)).toEqual([])
  })

  it('ignores an escaped brace in a selector', () => {
    expect(cssBalanceProblems('.w-\\{1\\} { color: red; }\n')).toEqual([])
  })

  it('flags an unterminated comment and an unterminated string', () => {
    expect(cssBalanceProblems('.a { color: red; }\n/* open')[0]?.message).toMatch(
      /comment is never closed/,
    )
    expect(cssBalanceProblems('.a { content: "x; }\n')[0]?.message).toMatch(
      /string is never closed/,
    )
  })
})

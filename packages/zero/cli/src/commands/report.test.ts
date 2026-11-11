import { createTerm, stripAnsi } from '@pyreon/ansi'
import { describe, expect, it } from 'vitest'
import { formatFailure } from './report'

describe('formatFailure', () => {
  const err = Object.assign(new Error('Unexpected token\nin the second line'), {
    id: '/repo/src/routes/index.tsx',
    loc: { file: '/repo/src/routes/index.tsx', line: 4, column: 12 },
    frame: '3 | export default () => (\n4 |   <div>{</div>\n  |        ^',
  })
  err.stack = 'Error: Unexpected token\n    at parse (/repo/node_modules/x.js:1:1)\n    at build (/repo/node_modules/y.js:2:2)'

  it('is rule 4: ✗ command · what: message, ↳ location, fix, then frame and stack dim', () => {
    const lines = formatFailure(createTerm({ level: 0, unicode: true }), 'zero build', 'Build failed', err, 'fix the syntax error')
    expect(lines).toEqual([
      '✗ zero build · Build failed: Unexpected token',
      '   ↳ /repo/src/routes/index.tsx:4:12',
      '   fix: fix the syntax error',
      '   in the second line',
      '   3 | export default () => (',
      '   4 |   <div>{</div>',
      '     |        ^',
      '   at parse (/repo/node_modules/x.js:1:1)',
      '   at build (/repo/node_modules/y.js:2:2)',
    ])
  })

  it('NO_COLOR output is complete at every level', () => {
    const plain = formatFailure(createTerm({ level: 0, unicode: true }), 'zero dev', 'Failed', err).join('\n')
    for (const level of [1, 2, 3] as const) {
      expect(stripAnsi(formatFailure(createTerm({ level, unicode: true }), 'zero dev', 'Failed', err).join('\n'))).toBe(plain)
    }
  })

  it('handles a thrown non-Error', () => {
    expect(formatFailure(createTerm({ level: 0, unicode: false }), 'zero dev', 'Failed', 'boom')).toEqual(['x zero dev - Failed: boom'])
  })
})

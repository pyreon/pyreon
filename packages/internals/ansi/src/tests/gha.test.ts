import { describe, expect, it } from 'vitest'
import { ghaAnnotation, ghaEscape, ghaLevel, ghaProperty } from '../index'

describe('gha', () => {
  it('escapes the message and, more strictly, property values', () => {
    expect(ghaEscape('50%\r\nnext')).toBe('50%25%0D%0Anext')
    expect(ghaProperty('a,b:c')).toBe('a%2Cb%3Ac')
  })
  it('maps severities; info is a notice', () => {
    expect([ghaLevel('error'), ghaLevel('warning'), ghaLevel('warn'), ghaLevel('info')]).toEqual([
      'error',
      'warning',
      'warning',
      'notice',
    ])
  })
  it('writes title, file, line, col in that order and omits what is missing', () => {
    expect(
      ghaAnnotation({ level: 'warning', title: 'for-missing-by', file: 'src/a,b.tsx', line: 3, column: 7, message: 'm\nn' }),
    ).toBe('::warning title=for-missing-by,file=src/a%2Cb.tsx,line=3,col=7::m%0An')
    expect(ghaAnnotation({ level: 'notice', message: 'summary' })).toBe('::notice::summary')
  })
})

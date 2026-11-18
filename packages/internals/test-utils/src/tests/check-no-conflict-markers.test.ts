// A conflict committed as git left it once sat on the default branch in a shell
// script no gate compiles. The gate matches the opening and closing markers.

import { describe, expect, it } from 'vitest'
import { findConflictMarkers } from '../../../../../scripts/check-no-conflict-markers'

describe('findConflictMarkers', () => {
  it('finds the markers of an ordinary conflict', () => {
    const text = ['a', '<<<<<<< HEAD', 'ours', '=======', 'theirs', '>>>>>>> origin/branch', 'b'].join('\n')
    expect(findConflictMarkers(text)).toEqual([2, 6])
  })

  it('finds the eight-character markers a rename conflict writes', () => {
    const text = ['<<<<<<<< HEAD:examples/a.sh', 'x', '========', 'y', '>>>>>>>> origin/branch:examples/b.sh'].join('\n')
    expect(findConflictMarkers(text)).toEqual([1, 5])
  })

  it('ignores a Markdown heading rule, indented or quoted markers and longer runs', () => {
    const text = [
      'Title',
      '=======',
      '    <<<<<<< HEAD',
      '`<<<<<<< HEAD`',
      '<<<<<<<<< nine characters is not a marker',
      '<<<<<<<',
      'a << b',
    ].join('\n')
    expect(findConflictMarkers(text)).toEqual([])
  })
})

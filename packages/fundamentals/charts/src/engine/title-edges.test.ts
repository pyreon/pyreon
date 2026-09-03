import { describe, expect, it } from 'vitest'
import { renderTitle } from './title'

const box = { x: 10, y: 20, w: 300, h: 100 }
const opts = { fontSize: 14, color: '#111' }

describe('renderTitle — edges', () => {
  it('nothing to draw → no commands and zero height', () => {
    expect(renderTitle('', undefined, box, opts)).toEqual({ cmds: [], height: 0 })
    expect(renderTitle('', '', box, opts).height).toBe(0)
  })
  it('a subtitle alone draws once at the subtitle size; end alignment anchors at the right edge', () => {
    const only = renderTitle('', 'sub', box, opts)
    expect(only.cmds).toHaveLength(1)
    const c = only.cmds[0]!
    if (c.kind !== 'text') throw new Error('text')
    expect(c.size).toBeCloseTo(14 * 0.8, 9)
    expect(c.at.y).toBe(20)
    const end = renderTitle('T', undefined, box, { ...opts, align: 'end' })
    const e = end.cmds[0]!
    if (e.kind !== 'text') throw new Error('text')
    expect(e.at.x).toBe(310)
    expect(e.align).toBe('end')
  })
})

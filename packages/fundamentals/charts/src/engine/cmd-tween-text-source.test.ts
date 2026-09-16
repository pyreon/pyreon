// A text target whose paired source is ALSO text inherits that source's size,
// so the glyph scales rather than popping in from nothing. The branch is only
// reachable through the cross-shape morph: when both frames share a shape,
// `universalTweenCmds` delegates to the ordinary tween and never pairs sources.
import { describe, expect, it } from 'vitest'
import { universalTweenCmds } from './cmd-tween'
import type { DrawCmd } from './types'

const text = (size: number): DrawCmd => ({ kind: 'text', text: 't', at: { x: 5, y: 5 }, fill: '#000', size, align: 'start', baseline: 'top' })
const rect: DrawCmd = { kind: 'rect', rect: { x: 0, y: 0, w: 4, h: 4 }, fill: '#000' }

describe('universalTweenCmds — a text target paired with a text source', () => {
  it('starts at the SOURCE text size when the frames differ in shape', () => {
    // Different lengths force the cross-shape path, where sources are paired by kind.
    const [first] = universalTweenCmds([text(24), rect], [text(10)], 0)
    expect(first!.kind === 'text' && first!.size).toBe(24)
  })

  it('starts from zero size when its paired source is not text', () => {
    const [first] = universalTweenCmds([rect, rect], [text(10)], 0)
    expect(first!.kind === 'text' && first!.size).toBe(0)
  })
})

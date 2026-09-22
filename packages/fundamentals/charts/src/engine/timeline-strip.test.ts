import { renderTimeline, timelineAdvance, timelineHit, timelineTick } from './timeline-strip'
import { defaultTimelineStrip, timelineSteps } from './option-composite'

const strip = defaultTimelineStrip(['a', 'b', 'c'])
const box = { x: 0, y: 0, w: 400, h: 40 }

describe('timeline strip', () => {
  it('draws a checkpoint per step, the play / pause and the step buttons', () => {
    const idle = renderTimeline(strip, box, 1, false)
    expect(idle.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : ''))).toEqual(['a', 'b', 'c'])
    // play (triangle) + prev + next = 3 polygons; playing swaps the triangle for two bars.
    expect(idle.filter((c) => c.kind === 'polygon')).toHaveLength(3)
    const playing = renderTimeline(strip, box, 1, true)
    expect(playing.filter((c) => c.kind === 'polygon')).toHaveLength(2)
    expect(playing.filter((c) => c.kind === 'rect')).toHaveLength(2)
  })

  it('hits the buttons, then the nearest checkpoint, and nothing off the strip', () => {
    expect(timelineHit(strip, box, 33, 16)).toEqual({ kind: 2, index: -1 })
    expect(timelineHit(strip, box, 57, 16)).toEqual({ kind: 3, index: -1 })
    expect(timelineHit(strip, box, 367, 16)).toEqual({ kind: 4, index: -1 })
    expect(timelineHit(strip, box, 72, 16)).toEqual({ kind: 1, index: 0 })
    expect(timelineHit(strip, box, 352, 20)).toEqual({ kind: 1, index: 2 })
    expect(timelineHit(strip, box, 150, 16).kind).toBe(0)
    expect(timelineHit(strip, box, 352, 80).kind).toBe(0)
  })

  it('steps wrap for the buttons; auto-play loops, rewinds, or stops at the end', () => {
    expect(timelineAdvance(strip, 2, 1, true)).toBe(0)
    expect(timelineAdvance(strip, 0, -1, true)).toBe(2)
    expect(timelineTick(strip, 2)).toBe(0)
    expect(timelineTick({ ...strip, loop: false }, 2)).toBe(-1)
    expect(timelineTick({ ...strip, rewind: true }, 0)).toBe(2)
    expect(timelineTick({ ...strip, rewind: true, loop: false }, 0)).toBe(-1)
  })

  it('reads loop, rewind, controlStyle and colours from the option', () => {
    const s = timelineSteps({ timeline: { data: ['x', 'y'], loop: false, rewind: true, controlStyle: { showPrevBtn: false }, checkpointStyle: { color: '#ff0000' } } })!.strip!
    expect(s).toMatchObject({ loop: false, rewind: true, showPlay: true, showPrev: false, showNext: true, accent: '#ff0000' })
    expect(timelineSteps({ timeline: { data: ['x'], controlStyle: { show: false } } })!.strip).toMatchObject({ showPlay: false, showPrev: false, showNext: false })
  })
})

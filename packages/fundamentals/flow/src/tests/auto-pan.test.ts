import { autoPanVelocity } from '../auto-pan'

// React Flow's calcAutoPan: 40px edge band, faster toward the edge, full speed
// past it. The native pyreonFlowAutoPanVelocity mirrors this arithmetic.

describe('autoPanVelocity', () => {
  it('is zero away from the edges', () => {
    expect(autoPanVelocity(400, 300, 800, 600)).toEqual({ x: 0, y: 0 })
  })

  it('pans toward the near edge, faster the closer the pointer', () => {
    // 20px into the 40px band on the left: half speed, positive (reveal the left).
    expect(autoPanVelocity(20, 300, 800, 600)).toEqual({ x: 7.5, y: 0 })
    // 20px from the right edge: half speed, negative.
    expect(autoPanVelocity(780, 300, 800, 600)).toEqual({ x: -7.5, y: 0 })
    expect(autoPanVelocity(400, 590, 800, 600).y).toBeCloseTo(-11.25)
  })

  it('is full speed at or past the edge', () => {
    expect(autoPanVelocity(-50, 300, 800, 600)).toEqual({ x: 15, y: 0 })
    expect(autoPanVelocity(900, 700, 800, 600)).toEqual({ x: -15, y: -15 })
  })

  it('honours the speed, and a container too small for two bands never pans', () => {
    expect(autoPanVelocity(0, 300, 800, 600, 30).x).toBe(30)
    expect(autoPanVelocity(0, 0, 60, 60)).toEqual({ x: 0, y: 0 })
  })
})

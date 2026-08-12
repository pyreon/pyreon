import { describe, expect, it } from 'vitest'
import { setTransition } from '../utils'

// setTransition is what actually APPLIES a stagger child's delay after the
// `transition` shorthand assignment. For `reverseLeave` to reverse the leave
// order, the leave phase must read the REVERSED `--kinetic-leave-delay`, not the
// forward `--kinetic-delay` used on enter.
describe('setTransition — phase-aware delay', () => {
  it('applies --kinetic-delay on the enter phase (default)', () => {
    const el = document.createElement('div')
    el.style.setProperty('--kinetic-delay', '100ms')
    el.style.setProperty('--kinetic-leave-delay', '0ms')
    setTransition(el, 'opacity 300ms ease')
    expect(el.style.transitionDelay).toBe('100ms')
  })

  it('applies the reversed --kinetic-leave-delay on the leave phase', () => {
    const el = document.createElement('div')
    el.style.setProperty('--kinetic-delay', '0ms') // forward enter (this item enters first)
    el.style.setProperty('--kinetic-leave-delay', '200ms') // reversed leave (this item leaves last)
    setTransition(el, 'opacity 300ms ease', 'leave')
    // Must pick the LEAVE var — this is what makes reverseLeave actually reverse
    // the leave order (before the fix, both phases used --kinetic-delay).
    expect(el.style.transitionDelay).toBe('200ms')
  })

  it('leave phase falls back to --kinetic-delay when no leave var is set (non-reverseLeave)', () => {
    const el = document.createElement('div')
    el.style.setProperty('--kinetic-delay', '80ms')
    setTransition(el, 'opacity 300ms ease', 'leave')
    expect(el.style.transitionDelay).toBe('80ms')
  })

  it('falls back to an inline transition-delay when no kinetic vars are set', () => {
    const el = document.createElement('div')
    el.style.transitionDelay = '40ms'
    setTransition(el, 'opacity 300ms ease')
    expect(el.style.transitionDelay).toBe('40ms')
  })
})

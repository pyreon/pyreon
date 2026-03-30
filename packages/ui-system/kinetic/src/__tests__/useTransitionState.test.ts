import { signal } from '@pyreon/reactivity'
import useTransitionState from '../useTransitionState'

describe('useTransitionState', () => {
  it('initial state is hidden when show=false', () => {
    const show = signal(false)
    const result = useTransitionState({ show })
    expect(result.stage()).toBe('hidden')
    expect(result.shouldMount()).toBe(false)
  })

  it('initial state is entered when show=true and appear=false', () => {
    const show = signal(true)
    const result = useTransitionState({ show })
    expect(result.stage()).toBe('entered')
    expect(result.shouldMount()).toBe(true)
  })

  it('transitions to entering when show changes false->true', () => {
    const show = signal(false)
    const result = useTransitionState({ show })

    expect(result.stage()).toBe('hidden')

    show.set(true)
    expect(result.stage()).toBe('entering')
    expect(result.shouldMount()).toBe(true)
  })

  it('complete() transitions entering->entered', () => {
    const show = signal(false)
    const result = useTransitionState({ show })

    show.set(true)
    expect(result.stage()).toBe('entering')

    result.complete()
    expect(result.stage()).toBe('entered')
  })

  it('transitions to leaving when show changes true->false', () => {
    const show = signal(true)
    const result = useTransitionState({ show })

    expect(result.stage()).toBe('entered')

    show.set(false)
    expect(result.stage()).toBe('leaving')
    expect(result.shouldMount()).toBe(true)
  })

  it('complete() transitions leaving->hidden', () => {
    const show = signal(true)
    const result = useTransitionState({ show })

    show.set(false)
    expect(result.stage()).toBe('leaving')

    result.complete()
    expect(result.stage()).toBe('hidden')
    expect(result.shouldMount()).toBe(false)
  })

  it('appear=true enters after ref is connected', () => {
    const show = signal(true)
    const result = useTransitionState({ show, appear: true })
    // Before ref is wired, element should be mounted but stage is 'entered'
    expect(result.stage()).toBe('entered')
    expect(result.shouldMount()).toBe(true)

    // Simulate ref connection (as the renderer would do)
    const el = document.createElement('div')
    if (typeof result.ref === 'function') {
      result.ref(el)
    }
    // Now the appear animation should trigger
    expect(result.stage()).toBe('entering')
  })

  it('complete() is a no-op in entered state', () => {
    const show = signal(true)
    const result = useTransitionState({ show })

    expect(result.stage()).toBe('entered')

    result.complete()
    expect(result.stage()).toBe('entered')
  })

  it('complete() is a no-op in hidden state', () => {
    const show = signal(false)
    const result = useTransitionState({ show })

    expect(result.stage()).toBe('hidden')

    result.complete()
    expect(result.stage()).toBe('hidden')
  })

  it('handles rapid toggling true->false->true', () => {
    const show = signal(true)
    const result = useTransitionState({ show })

    // Start leave
    show.set(false)
    expect(result.stage()).toBe('leaving')

    // Interrupt with enter before leave completes
    show.set(true)
    expect(result.stage()).toBe('entering')
  })

  it('handles rapid toggling false->true->false (entering to leaving)', () => {
    const show = signal(false)
    const result = useTransitionState({ show })

    // Start enter
    show.set(true)
    expect(result.stage()).toBe('entering')

    // Interrupt with leave before enter completes
    show.set(false)
    expect(result.stage()).toBe('leaving')
  })

  it('provides a ref (callback or object)', () => {
    const show = signal(false)
    const result = useTransitionState({ show })
    expect(result.ref).toBeDefined()
    expect(typeof result.ref === 'function' || 'current' in result.ref).toBe(true)
  })
})

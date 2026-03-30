import { fade, presets, scaleIn, slideDown, slideLeft, slideRight, slideUp } from '../presets'

describe('presets', () => {
  const allPresets = {
    fade,
    scaleIn,
    slideUp,
    slideDown,
    slideLeft,
    slideRight,
  }

  it.each(Object.entries(allPresets))('%s has all required style properties', (_, preset) => {
    expect(preset.enterStyle).toBeDefined()
    expect(preset.enterToStyle).toBeDefined()
    expect(preset.enterTransition).toBeDefined()
    expect(preset.leaveStyle).toBeDefined()
    expect(preset.leaveToStyle).toBeDefined()
    expect(preset.leaveTransition).toBeDefined()
  })

  it.each(Object.entries(allPresets))('%s has non-empty transition strings', (_, preset) => {
    expect(typeof preset.enterTransition).toBe('string')
    expect((preset.enterTransition as string).length).toBeGreaterThan(0)
    expect(typeof preset.leaveTransition).toBe('string')
    expect((preset.leaveTransition as string).length).toBeGreaterThan(0)
  })

  it('presets object contains all expected presets', () => {
    expect(Object.keys(presets)).toEqual([
      'fade',
      'scaleIn',
      'slideUp',
      'slideDown',
      'slideLeft',
      'slideRight',
    ])
  })

  it('presets are plain objects (no side effects)', () => {
    for (const preset of Object.values(presets)) {
      expect(typeof preset).toBe('object')
      expect(preset).not.toBeInstanceOf(Array)
    }
  })
})

import { describe, expect, it } from 'vitest'
import theme from '../theme'

describe('theme', () => {
  it('exports a theme object', () => {
    expect(theme).toBeDefined()
    expect(typeof theme).toBe('object')
  })

  it('has color system', () => {
    expect(theme.color.system.primary.base).toBeDefined()
    expect(theme.color.system.error.base).toBeDefined()
    expect(theme.color.system.success.base).toBeDefined()
    expect(theme.color.system.warning.base).toBeDefined()
    expect(theme.color.system.info.base).toBeDefined()
    expect(theme.color.system.light.base).toBeDefined()
    expect(theme.color.system.dark.base).toBeDefined()
  })

  it('has opacity levels for each color', () => {
    for (const level of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const) {
      expect(theme.color.system.primary[level]).toBeDefined()
    }
  })

  it('has spacing scale', () => {
    expect(theme.spacing.reset).toBe(0)
    expect(theme.spacing.small).toBe(8)
    expect(theme.spacing.medium).toBe(12)
    expect(theme.spacing.large).toBe(16)
  })

  it('has font sizes', () => {
    expect(theme.fontSize.base).toBe(14)
    expect(theme.fontSize.small).toBe(12)
    expect(theme.fontSize.medium).toBe(16)
  })

  it('has heading sizes', () => {
    expect(theme.headingSize.level1).toBe(32)
    expect(theme.headingSize.level6).toBe(12)
  })

  it('has border radius', () => {
    expect(theme.borderRadius.reset).toBe(0)
    expect(theme.borderRadius.base).toBe(4)
    expect(theme.borderRadius.pill).toBe(9999)
  })

  it('has transitions', () => {
    expect(theme.transition.base).toContain('ease')
    expect(theme.transition.fast).toContain('ease')
  })

  it('has shadows', () => {
    expect(theme.shadows.base).toContain('rgba')
    expect(theme.shadows.small).toContain('rgba')
  })

  it('has z-index layers', () => {
    expect(theme.zIndex.modal.content).toBeGreaterThan(theme.zIndex.drawer.content)
    expect(theme.zIndex.drawer.content).toBeGreaterThan(theme.zIndex.popover.content)
  })
})

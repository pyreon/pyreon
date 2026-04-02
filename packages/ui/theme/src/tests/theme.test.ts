import { describe, expect, it } from 'vitest'
import { createTheme } from '../createTheme'
import { defaultTheme } from '../defaultTheme'
import { buildSemantics, m, resolveMode } from '../semantics'

describe('defaultTheme', () => {
  it('has all required top-level keys', () => {
    expect(defaultTheme.colors).toBeDefined()
    expect(defaultTheme.semantic).toBeDefined()
    expect(defaultTheme.fontFamily).toBeDefined()
    expect(defaultTheme.fontSize).toBeDefined()
    expect(defaultTheme.fontWeight).toBeDefined()
    expect(defaultTheme.lineHeight).toBeDefined()
    expect(defaultTheme.spacing).toBeDefined()
    expect(defaultTheme.radii).toBeDefined()
    expect(defaultTheme.shadows).toBeDefined()
    expect(defaultTheme.transition).toBeDefined()
  })

  it('has semantic color palettes', () => {
    expect(defaultTheme.colors.primary).toBeDefined()
    expect(defaultTheme.colors.error).toBeDefined()
    expect(defaultTheme.colors.success).toBeDefined()
  })

  it('semantic has mode-aware values', () => {
    expect(defaultTheme.semantic.bg.light).toBeDefined()
    expect(defaultTheme.semantic.bg.dark).toBeDefined()
  })
})

describe('createTheme', () => {
  it('returns defaultTheme when no overrides', () => {
    const theme = createTheme()
    expect(theme.colors.primary[500]).toBe(defaultTheme.colors.primary[500])
  })

  it('deep merges color overrides', () => {
    const theme = createTheme({
      colors: { primary: { 500: '#custom' } as any },
    })
    expect(theme.colors.primary[500]).toBe('#custom')
    // Other shades preserved
    expect(theme.colors.primary[100]).toBe(defaultTheme.colors.primary[100])
  })

  it('overrides radii', () => {
    const theme = createTheme({ radii: { md: 8 } })
    expect(theme.radii.md).toBe(8)
    expect(theme.radii.lg).toBe(defaultTheme.radii.lg)
  })

  it('rebuilds semantics when colors change', () => {
    const theme = createTheme({
      colors: { gray: { 50: '#fff', 950: '#000' } as any },
    })
    expect(theme.semantic.bg.light).toBe('#fff')
    expect(theme.semantic.bg.dark).toBe('#000')
  })

  it('does not rebuild semantics if explicitly provided', () => {
    const theme = createTheme({
      colors: { gray: { 50: '#fff' } as any },
      semantic: { bg: { light: '#custom', dark: '#custom2' } } as any,
    })
    expect(theme.semantic.bg.light).toBe('#custom')
  })
})

describe('m() — mode-aware value', () => {
  it('creates a light/dark object', () => {
    const val = m('white', 'black')
    expect(val.light).toBe('white')
    expect(val.dark).toBe('black')
  })
})

describe('resolveMode', () => {
  it('resolves mode-aware values', () => {
    const val = m('#fff', '#000')
    expect(resolveMode(val, 'light')).toBe('#fff')
    expect(resolveMode(val, 'dark')).toBe('#000')
  })

  it('returns static values unchanged', () => {
    expect(resolveMode('red', 'light')).toBe('red')
    expect(resolveMode('red', 'dark')).toBe('red')
    expect(resolveMode(42, 'light')).toBe(42)
  })
})

describe('buildSemantics', () => {
  it('returns all semantic keys', () => {
    const gray = defaultTheme.colors.gray
    const primary = defaultTheme.colors.primary
    const sem = buildSemantics(gray, primary)

    expect(sem.bg).toBeDefined()
    expect(sem.bgSubtle).toBeDefined()
    expect(sem.bgMuted).toBeDefined()
    expect(sem.text).toBeDefined()
    expect(sem.textMuted).toBeDefined()
    expect(sem.textSubtle).toBeDefined()
    expect(sem.border).toBeDefined()
    expect(sem.borderMuted).toBeDefined()
    expect(sem.ring).toBeDefined()
  })

  it('uses gray for bg and primary for ring', () => {
    const gray = defaultTheme.colors.gray
    const primary = defaultTheme.colors.primary
    const sem = buildSemantics(gray, primary)

    expect(sem.bg.light).toBe(gray[50])
    expect(sem.ring.light).toBe(primary[500])
  })
})

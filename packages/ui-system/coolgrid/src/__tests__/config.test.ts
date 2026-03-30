import { describe, expect, it } from 'vitest'

describe('config', () => {
  describe('theme defaults', () => {
    it('has correct default theme', async () => {
      const theme = (await import('../theme')).default
      expect(theme).toEqual({
        rootSize: 16,
        breakpoints: {
          xs: 0,
          sm: 576,
          md: 768,
          lg: 992,
          xl: 1200,
        },
        grid: {
          columns: 12,
          container: {
            xs: '100%',
            sm: 540,
            md: 720,
            lg: 960,
            xl: 1140,
          },
        },
      })
    })
  })

  describe('defaultBreakpoints', () => {
    it('has all standard breakpoints', async () => {
      const { defaultBreakpoints } = await import('../theme')
      expect(defaultBreakpoints).toEqual({
        xs: 0,
        sm: 576,
        md: 768,
        lg: 992,
        xl: 1200,
      })
    })

    it('breakpoints are in ascending order', async () => {
      const { defaultBreakpoints } = await import('../theme')
      const values = Object.values(defaultBreakpoints)
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1] as number)
      }
    })
  })

  describe('defaultContainerWidths', () => {
    it('has widths for all breakpoints', async () => {
      const { defaultContainerWidths } = await import('../theme')
      expect(defaultContainerWidths).toEqual({
        xs: '100%',
        sm: 540,
        md: 720,
        lg: 960,
        xl: 1140,
      })
    })

    it('xs is percentage, others are numbers', async () => {
      const { defaultContainerWidths } = await import('../theme')
      expect(typeof defaultContainerWidths.xs).toBe('string')
      expect(typeof defaultContainerWidths.sm).toBe('number')
      expect(typeof defaultContainerWidths.md).toBe('number')
      expect(typeof defaultContainerWidths.lg).toBe('number')
      expect(typeof defaultContainerWidths.xl).toBe('number')
    })

    it('numeric widths are in ascending order', async () => {
      const { defaultContainerWidths } = await import('../theme')
      const numericWidths = [
        defaultContainerWidths.sm,
        defaultContainerWidths.md,
        defaultContainerWidths.lg,
        defaultContainerWidths.xl,
      ] as number[]
      for (let i = 1; i < numericWidths.length; i++) {
        expect(numericWidths[i]).toBeGreaterThan(numericWidths[i - 1] as number)
      }
    })
  })

  describe('ContainerContext', () => {
    it('is created via createContext with an id', async () => {
      const { ContainerContext } = await import('../context')
      expect(ContainerContext).toHaveProperty('id')
    })
  })

  describe('RowContext', () => {
    it('is created via createContext with an id', async () => {
      const { RowContext } = await import('../context')
      expect(RowContext).toHaveProperty('id')
    })
  })

  describe('constants', () => {
    it('has correct PKG_NAME', async () => {
      const { PKG_NAME } = await import('../constants')
      expect(PKG_NAME).toBe('@pyreon/coolgrid')
    })

    it('has CONTEXT_KEYS', async () => {
      const { CONTEXT_KEYS } = await import('../constants')
      expect(CONTEXT_KEYS).toContain('columns')
      expect(CONTEXT_KEYS).toContain('size')
      expect(CONTEXT_KEYS).toContain('gap')
      expect(CONTEXT_KEYS).toContain('padding')
      expect(CONTEXT_KEYS).toContain('gutter')
      expect(CONTEXT_KEYS).toContain('colCss')
      expect(CONTEXT_KEYS).toContain('colComponent')
      expect(CONTEXT_KEYS).toContain('rowCss')
      expect(CONTEXT_KEYS).toContain('rowComponent')
      expect(CONTEXT_KEYS).toContain('contentAlignX')
    })
  })
})

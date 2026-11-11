import { describe, expect, it } from 'vitest'
import { getContainerWidth } from '../Container/utils'
import { defaultContainerWidths } from '../theme'

describe('Container/utils – getContainerWidth', () => {
  it('returns width from props when present', () => {
    const result = getContainerWidth({ width: 960 }, {})
    expect(result).toBe(960)
  })

  it('prefers props.width over theme.grid.container', () => {
    const result = getContainerWidth(
      { width: 800 },
      { grid: { container: { xs: '100%', md: 720 } } },
    )
    expect(result).toBe(800)
  })

  it('falls back to theme.grid.container', () => {
    const result = getContainerWidth({}, { grid: { container: { xs: '100%', md: 720 } } })
    expect(result).toEqual({ xs: '100%', md: 720 })
  })

  it('falls back to theme.coolgrid.container when grid is missing', () => {
    const result = getContainerWidth({}, { coolgrid: { container: { xs: '100%', lg: 960 } } })
    expect(result).toEqual({ xs: '100%', lg: 960 })
  })

  // #4314: a theme without breakpoints falls back to coolgrid's default widths
  it('falls back to the default widths when nothing matches', () => {
    expect(getContainerWidth({}, {})).toEqual(defaultContainerWidths)
  })

  it('falls back to the default widths when both are undefined', () => {
    expect(getContainerWidth(undefined, undefined)).toEqual(defaultContainerWidths)
  })

  it('returns undefined when the theme has its own breakpoints but no container', () => {
    expect(getContainerWidth({}, { breakpoints: { phone: 0, tablet: 600 } })).toBeUndefined()
  })

  it('returns string width from props', () => {
    const result = getContainerWidth({ width: '100%' }, {})
    expect(result).toBe('100%')
  })

  it('returns responsive object from props', () => {
    const result = getContainerWidth({ width: { xs: '100%', md: 720, lg: 960 } }, {})
    expect(result).toEqual({ xs: '100%', md: 720, lg: 960 })
  })
})

import { describe, expect, it } from 'vitest'
import * as unistyle from '../index'

describe('index exports', () => {
  it('exports breakpoints', () => {
    expect(unistyle.breakpoints).toBeDefined()
    expect(typeof unistyle.breakpoints).toBe('object')
  })

  it('exports sortBreakpoints', () => {
    expect(unistyle.sortBreakpoints).toBeDefined()
    expect(typeof unistyle.sortBreakpoints).toBe('function')
  })

  it('exports createMediaQueries', () => {
    expect(unistyle.createMediaQueries).toBeDefined()
    expect(typeof unistyle.createMediaQueries).toBe('function')
  })

  it('exports makeItResponsive', () => {
    expect(unistyle.makeItResponsive).toBeDefined()
    expect(typeof unistyle.makeItResponsive).toBe('function')
  })

  it('exports normalizeTheme', () => {
    expect(unistyle.normalizeTheme).toBeDefined()
    expect(typeof unistyle.normalizeTheme).toBe('function')
  })

  it('exports transformTheme', () => {
    expect(unistyle.transformTheme).toBeDefined()
    expect(typeof unistyle.transformTheme).toBe('function')
  })

  it('exports styles', () => {
    expect(unistyle.styles).toBeDefined()
    expect(typeof unistyle.styles).toBe('function')
  })

  it('exports alignContent', () => {
    expect(unistyle.alignContent).toBeDefined()
    expect(typeof unistyle.alignContent).toBe('function')
  })

  it('exports extendCss', () => {
    expect(unistyle.extendCss).toBeDefined()
    expect(typeof unistyle.extendCss).toBe('function')
  })

  it('exports stripUnit', () => {
    expect(unistyle.stripUnit).toBeDefined()
    expect(typeof unistyle.stripUnit).toBe('function')
  })

  it('exports value', () => {
    expect(unistyle.value).toBeDefined()
    expect(typeof unistyle.value).toBe('function')
  })

  it('exports values', () => {
    expect(unistyle.values).toBeDefined()
    expect(typeof unistyle.values).toBe('function')
  })

  it('exports Provider', () => {
    expect(unistyle.Provider).toBeDefined()
    expect(typeof unistyle.Provider).toBe('function')
  })

  it('exports context', () => {
    expect(unistyle.context).toBeDefined()
  })

  it('exports align content constants', () => {
    expect(unistyle.ALIGN_CONTENT_DIRECTION).toBeDefined()
    expect(unistyle.ALIGN_CONTENT_MAP_X).toBeDefined()
    expect(unistyle.ALIGN_CONTENT_MAP_Y).toBeDefined()
  })
})

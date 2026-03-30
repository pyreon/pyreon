import { afterEach, describe, expect, it } from 'vitest'
import { createGlobalStyle } from '../globalStyle'
import { sheet } from '../sheet'

describe('createGlobalStyle -- empty CSS paths', () => {
  afterEach(() => {
    sheet.clearAll()
  })

  it('static: returns null for empty template', () => {
    const GlobalStyle = createGlobalStyle``
    const result = GlobalStyle({})
    expect(result).toBeNull()
  })

  it('static: returns null for whitespace-only template', () => {
    const GlobalStyle = createGlobalStyle`   `
    const result = GlobalStyle({})
    expect(result).toBeNull()
  })

  it('dynamic: returns null when interpolation resolves to empty CSS', () => {
    const GlobalStyle = createGlobalStyle`${({ theme }: any) => (theme.empty ? '' : '')}`
    const result = GlobalStyle({})
    expect(result).toBeNull()
  })

  it('dynamic: returns null when interpolation resolves to whitespace', () => {
    const GlobalStyle = createGlobalStyle`${() => '   '}`
    const result = GlobalStyle({})
    expect(result).toBeNull()
  })
})

describe('createGlobalStyle', () => {
  afterEach(() => {
    sheet.clearAll()
  })

  it('returns a component function', () => {
    const GlobalStyle = createGlobalStyle`
      body { margin: 0; }
    `
    expect(typeof GlobalStyle).toBe('function')
  })

  it('renders nothing (returns null)', () => {
    const GlobalStyle = createGlobalStyle`
      body { margin: 0; padding: 0; }
    `
    const result = GlobalStyle({})
    expect(result).toBeNull()
  })

  it('handles dynamic interpolations with theme', () => {
    // Dynamic path: function interpolation causes per-render resolution
    const GlobalStyle = createGlobalStyle`
      body { font-family: ${({ theme }: any) => theme?.font ?? 'sans-serif'}; }
    `
    const result = GlobalStyle({})
    expect(result).toBeNull()
  })

  it('handles static interpolations', () => {
    const color = 'red'
    const GlobalStyle = createGlobalStyle`
      body { color: ${color}; }
    `
    const result = GlobalStyle({})
    expect(result).toBeNull()
  })
})

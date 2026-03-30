import { describe, expect, it } from 'vitest'
import { resolveStyles } from '../resolveStyles'

describe('resolveStyles', () => {
  it('resolves typography properties', () => {
    const result = resolveStyles({
      fontSize: '14px',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'bold',
      fontStyle: 'italic',
      textDecoration: 'underline',
      color: '#333333',
      textAlign: 'center',
      lineHeight: 1.5,
      letterSpacing: '0.5px',
    })

    expect(result).toEqual({
      fontSize: 14,
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'bold',
      fontStyle: 'italic',
      textDecoration: 'underline',
      color: '#333333',
      textAlign: 'center',
      lineHeight: 1.5,
      letterSpacing: 0.5,
    })
  })

  it('resolves box model properties', () => {
    const result = resolveStyles({
      padding: '8px 16px',
      margin: '12px',
    })

    expect(result).toEqual({
      padding: [8, 16],
      margin: 12,
    })
  })

  it('resolves border properties', () => {
    const result = resolveStyles({
      borderRadius: '4px',
      borderWidth: '1px',
      borderColor: '#dddddd',
      borderStyle: 'solid',
    })

    expect(result).toEqual({
      borderRadius: 4,
      borderWidth: 1,
      borderColor: '#dddddd',
      borderStyle: 'solid',
    })
  })

  it('resolves sizing properties', () => {
    const result = resolveStyles({
      width: '200px',
      height: 100,
      maxWidth: '100%',
    })

    expect(result).toEqual({
      width: 200,
      height: 100,
      maxWidth: '100%',
    })
  })

  it('handles numeric values directly', () => {
    const result = resolveStyles({
      fontSize: 14,
      padding: 8,
      opacity: 0.5,
    })

    expect(result).toEqual({
      fontSize: 14,
      padding: 8,
      opacity: 0.5,
    })
  })

  it('ignores irrelevant CSS properties', () => {
    const result = resolveStyles({
      fontSize: 14,
      transition: 'all 0.2s',
      cursor: 'pointer',
      display: 'flex',
      position: 'relative',
      transform: 'translateX(10px)',
    })

    expect(result).toEqual({ fontSize: 14 })
  })

  it('skips invalid values', () => {
    const result = resolveStyles({
      fontStyle: 'oblique',
      textDecoration: 'overline',
      borderStyle: 'none',
      textAlign: 'start',
    })

    expect(result).toEqual({})
  })

  it('returns empty object for empty input', () => {
    expect(resolveStyles({})).toEqual({})
  })

  it('handles backgroundColor', () => {
    const result = resolveStyles({ backgroundColor: '#4f46e5' })
    expect(result).toEqual({ backgroundColor: '#4f46e5' })
  })

  it('converts rem values using rootSize', () => {
    const result = resolveStyles({ fontSize: '1.5rem' }, 20)
    expect(result).toEqual({ fontSize: 30 })
  })
})

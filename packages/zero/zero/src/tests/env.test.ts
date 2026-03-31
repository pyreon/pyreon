import { describe, expect, it } from 'vitest'
import { bool, num, oneOf, publicEnv, str, url, validateEnv } from '../env'

describe('str validator', () => {
  it('accepts valid string', () => {
    const schema = { NAME: str() }
    const result = validateEnv(schema, { NAME: 'hello' })
    expect(result.NAME).toBe('hello')
  })

  it('throws on missing required string', () => {
    expect(() => validateEnv({ NAME: str() }, {})).toThrow('NAME')
  })

  it('uses default value', () => {
    const result = validateEnv({ NAME: str({ default: 'world' }) }, {})
    expect(result.NAME).toBe('world')
  })

  it('throws on empty string without default', () => {
    expect(() => validateEnv({ NAME: str() }, { NAME: '' })).toThrow('NAME')
  })
})

describe('num validator', () => {
  it('parses valid number', () => {
    const result = validateEnv({ PORT: num() }, { PORT: '3000' })
    expect(result.PORT).toBe(3000)
  })

  it('throws on NaN', () => {
    expect(() => validateEnv({ PORT: num() }, { PORT: 'abc' })).toThrow('must be a number')
  })

  it('uses default', () => {
    const result = validateEnv({ PORT: num({ default: 8080 }) }, {})
    expect(result.PORT).toBe(8080)
  })

  it('parses float', () => {
    const result = validateEnv({ RATE: num() }, { RATE: '1.5' })
    expect(result.RATE).toBe(1.5)
  })
})

describe('bool validator', () => {
  it('parses true values', () => {
    expect(validateEnv({ X: bool() }, { X: 'true' }).X).toBe(true)
    expect(validateEnv({ X: bool() }, { X: '1' }).X).toBe(true)
    expect(validateEnv({ X: bool() }, { X: 'TRUE' }).X).toBe(true)
  })

  it('parses false values', () => {
    expect(validateEnv({ X: bool() }, { X: 'false' }).X).toBe(false)
    expect(validateEnv({ X: bool() }, { X: '0' }).X).toBe(false)
  })

  it('throws on invalid boolean', () => {
    expect(() => validateEnv({ X: bool() }, { X: 'yes' })).toThrow('must be "true" or "false"')
  })

  it('uses default', () => {
    expect(validateEnv({ X: bool({ default: false }) }, {}).X).toBe(false)
  })
})

describe('url validator', () => {
  it('accepts valid URL', () => {
    const result = validateEnv({ DB: url() }, { DB: 'https://db.example.com' })
    expect(result.DB).toBe('https://db.example.com')
  })

  it('throws on invalid URL', () => {
    expect(() => validateEnv({ DB: url() }, { DB: 'not-a-url' })).toThrow('must be a valid URL')
  })

  it('uses default', () => {
    const result = validateEnv({ DB: url({ default: 'http://localhost' }) }, {})
    expect(result.DB).toBe('http://localhost')
  })
})

describe('oneOf validator', () => {
  it('accepts valid value', () => {
    const result = validateEnv(
      { ENV: oneOf(['development', 'production', 'test'] as const) },
      { ENV: 'production' },
    )
    expect(result.ENV).toBe('production')
  })

  it('throws on invalid value', () => {
    expect(() =>
      validateEnv(
        { ENV: oneOf(['development', 'production'] as const) },
        { ENV: 'staging' },
      ),
    ).toThrow('must be one of')
  })

  it('uses default', () => {
    const result = validateEnv(
      { ENV: oneOf(['dev', 'prod'] as const, { default: 'dev' }) },
      {},
    )
    expect(result.ENV).toBe('dev')
  })
})

describe('validateEnv', () => {
  it('validates multiple variables', () => {
    const result = validateEnv(
      {
        PORT: num({ default: 3000 }),
        HOST: str({ default: 'localhost' }),
        DEBUG: bool({ default: false }),
      },
      {},
    )
    expect(result.PORT).toBe(3000)
    expect(result.HOST).toBe('localhost')
    expect(result.DEBUG).toBe(false)
  })

  it('collects ALL errors, not just first', () => {
    try {
      validateEnv(
        { A: str(), B: num(), C: url() },
        {},
      )
      expect.unreachable('should throw')
    } catch (e: any) {
      expect(e.message).toContain('3 errors')
      expect(e.message).toContain('A')
      expect(e.message).toContain('B')
      expect(e.message).toContain('C')
    }
  })

  it('includes description in error', () => {
    try {
      validateEnv(
        { API_KEY: str({ description: 'API authentication key' }) },
        {},
      )
      expect.unreachable('should throw')
    } catch (e: any) {
      expect(e.message).toContain('API authentication key')
    }
  })
})

describe('publicEnv', () => {
  const originalEnv = process.env

  it('extracts ZERO_PUBLIC_ prefixed vars', () => {
    process.env = {
      ...originalEnv,
      ZERO_PUBLIC_API_URL: 'https://api.example.com',
      ZERO_PUBLIC_APP_NAME: 'MyApp',
      DATABASE_URL: 'postgres://secret',
    }
    const result = publicEnv()
    expect(result.API_URL).toBe('https://api.example.com')
    expect(result.APP_NAME).toBe('MyApp')
    expect((result as any).DATABASE_URL).toBeUndefined()
    process.env = originalEnv
  })

  it('validates with schema using ZERO_PUBLIC_ prefix', () => {
    process.env = {
      ...originalEnv,
      ZERO_PUBLIC_PORT: '3000',
      ZERO_PUBLIC_DEBUG: 'true',
    }
    const result = publicEnv({
      PORT: num(),
      DEBUG: bool(),
    })
    expect(result.PORT).toBe(3000)
    expect(result.DEBUG).toBe(true)
    process.env = originalEnv
  })
})

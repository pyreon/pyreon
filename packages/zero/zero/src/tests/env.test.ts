import { describe, expect, it } from 'vitest'
import { bool, num, oneOf, publicEnv, str, url, validateEnv } from '../env'

describe('plain value inference', () => {
  it('infers string from default', () => {
    const result = validateEnv({ HOST: 'localhost' }, {})
    expect(result.HOST).toBe('localhost')
  })

  it('overrides string default with env value', () => {
    const result = validateEnv({ HOST: 'localhost' }, { HOST: '0.0.0.0' })
    expect(result.HOST).toBe('0.0.0.0')
  })

  it('infers number from default', () => {
    const result = validateEnv({ PORT: 3000 }, {})
    expect(result.PORT).toBe(3000)
  })

  it('overrides number default with env value', () => {
    const result = validateEnv({ PORT: 3000 }, { PORT: '8080' })
    expect(result.PORT).toBe(8080)
  })

  it('infers boolean from default', () => {
    const result = validateEnv({ DEBUG: false }, {})
    expect(result.DEBUG).toBe(false)
  })

  it('overrides boolean default with env value', () => {
    const result = validateEnv({ DEBUG: false }, { DEBUG: 'true' })
    expect(result.DEBUG).toBe(true)
  })
})

describe('constructor markers', () => {
  it('String requires a value', () => {
    expect(() => validateEnv({ NAME: String }, {})).toThrow('NAME')
  })

  it('String accepts value', () => {
    const result = validateEnv({ NAME: String }, { NAME: 'hello' })
    expect(result.NAME).toBe('hello')
  })

  it('Number requires a value', () => {
    expect(() => validateEnv({ PORT: Number }, {})).toThrow('PORT')
  })

  it('Number parses value', () => {
    const result = validateEnv({ PORT: Number }, { PORT: '3000' })
    expect(result.PORT).toBe(3000)
  })

  it('Number rejects NaN', () => {
    expect(() => validateEnv({ PORT: Number }, { PORT: 'abc' })).toThrow('must be a number')
  })

  it('Boolean requires a value', () => {
    expect(() => validateEnv({ X: Boolean }, {})).toThrow('X')
  })

  it('Boolean parses value', () => {
    expect(validateEnv({ X: Boolean }, { X: 'true' }).X).toBe(true)
    expect(validateEnv({ X: Boolean }, { X: '0' }).X).toBe(false)
  })
})

describe('explicit validators', () => {
  it('str() requires value', () => {
    expect(() => validateEnv({ NAME: str() }, {})).toThrow('NAME')
  })

  it('str() with default', () => {
    expect(validateEnv({ NAME: str({ default: 'world' }) }, {}).NAME).toBe('world')
  })

  it('num() with default', () => {
    expect(validateEnv({ PORT: num({ default: 8080 }) }, {}).PORT).toBe(8080)
  })

  it('bool() parses true/false/1/0', () => {
    expect(validateEnv({ X: bool() }, { X: 'true' }).X).toBe(true)
    expect(validateEnv({ X: bool() }, { X: '1' }).X).toBe(true)
    expect(validateEnv({ X: bool() }, { X: 'false' }).X).toBe(false)
    expect(validateEnv({ X: bool() }, { X: '0' }).X).toBe(false)
  })

  it('bool() rejects invalid', () => {
    expect(() => validateEnv({ X: bool() }, { X: 'yes' })).toThrow('must be "true" or "false"')
  })

  it('url() validates', () => {
    const result = validateEnv({ DB: url() }, { DB: 'https://db.example.com' })
    expect(result.DB).toBe('https://db.example.com')
  })

  it('url() rejects invalid', () => {
    expect(() => validateEnv({ DB: url() }, { DB: 'not-a-url' })).toThrow('must be a valid URL')
  })

  it('oneOf() validates', () => {
    const result = validateEnv(
      { ENV: oneOf(['dev', 'prod'] as const) },
      { ENV: 'prod' },
    )
    expect(result.ENV).toBe('prod')
  })

  it('oneOf() rejects invalid', () => {
    expect(() => validateEnv(
      { ENV: oneOf(['dev', 'prod'] as const) },
      { ENV: 'staging' },
    )).toThrow('must be one of')
  })
})

describe('mixed schema', () => {
  it('combines plain values, constructors, and validators', () => {
    const result = validateEnv(
      {
        PORT: 3000,
        HOST: 'localhost',
        DEBUG: false,
        API_KEY: String,
        DATABASE_URL: url(),
      },
      {
        API_KEY: 'secret',
        DATABASE_URL: 'https://db.example.com',
      },
    )
    expect(result.PORT).toBe(3000)
    expect(result.HOST).toBe('localhost')
    expect(result.DEBUG).toBe(false)
    expect(result.API_KEY).toBe('secret')
    expect(result.DATABASE_URL).toBe('https://db.example.com')
  })

  it('collects ALL errors, not just first', () => {
    try {
      validateEnv({ A: String, B: Number, C: url() }, {})
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
      validateEnv({ API_KEY: str({ description: 'API authentication key' }) }, {})
      expect.unreachable('should throw')
    } catch (e: any) {
      expect(e.message).toContain('API authentication key')
    }
  })
})

describe('publicEnv', () => {
  it('extracts ZERO_PUBLIC_ prefixed vars', () => {
    const saved = process.env
    process.env = {
      ZERO_PUBLIC_API_URL: 'https://api.example.com',
      ZERO_PUBLIC_APP_NAME: 'MyApp',
      DATABASE_URL: 'postgres://secret',
    }
    try {
      const result = publicEnv()
      expect(result.API_URL).toBe('https://api.example.com')
      expect(result.APP_NAME).toBe('MyApp')
      expect((result as any).DATABASE_URL).toBeUndefined()
    } finally {
      process.env = saved
    }
  })

  it('validates with schema using ZERO_PUBLIC_ prefix', () => {
    const saved = process.env
    process.env = {
      ZERO_PUBLIC_PORT: '3000',
      ZERO_PUBLIC_DEBUG: 'true',
    }
    try {
      const result = publicEnv({
        PORT: Number,
        DEBUG: Boolean,
      })
      expect(result.PORT).toBe(3000)
      expect(result.DEBUG).toBe(true)
    } finally {
      process.env = saved
    }
  })

  it('uses defaults in publicEnv schema', () => {
    const saved = process.env
    process.env = {}
    try {
      const result = publicEnv({ APP_NAME: 'Default App' })
      expect(result.APP_NAME).toBe('Default App')
    } finally {
      process.env = saved
    }
  })
})

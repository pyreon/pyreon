import { describe, expect, it } from 'vitest'
import { schema, validateEnv } from '../env'

// Mock schema library parse functions (simulating Zod/Valibot/ArkType)

function mockParseNumber(raw: string): number {
  const n = Number(raw)
  if (Number.isNaN(n)) throw new Error('Expected number')
  return n
}

function mockParseUrl(raw: string): string {
  new URL(raw) // throws if invalid
  return raw
}

function mockParseEnum(allowed: string[]) {
  return (raw: string) => {
    if (!allowed.includes(raw)) throw new Error(`Must be one of: ${allowed.join(', ')}`)
    return raw
  }
}

describe('schema() — generic bridge', () => {
  it('validates with custom parse function', () => {
    const result = validateEnv(
      { PORT: schema(mockParseNumber) },
      { PORT: '3000' },
    )
    expect(result.PORT).toBe(3000)
  })

  it('throws on parse failure', () => {
    expect(() => validateEnv(
      { PORT: schema(mockParseNumber) },
      { PORT: 'abc' },
    )).toThrow('Expected number')
  })

  it('throws on missing value', () => {
    expect(() => validateEnv(
      { PORT: schema(mockParseNumber) },
      {},
    )).toThrow('PORT')
  })

  it('validates URL', () => {
    const result = validateEnv(
      { API: schema(mockParseUrl) },
      { API: 'https://api.example.com' },
    )
    expect(result.API).toBe('https://api.example.com')
  })

  it('rejects invalid URL', () => {
    expect(() => validateEnv(
      { API: schema(mockParseUrl) },
      { API: 'not-a-url' },
    )).toThrow('API')
  })

  it('validates enum', () => {
    const result = validateEnv(
      { ENV: schema(mockParseEnum(['dev', 'prod'])) },
      { ENV: 'prod' },
    )
    expect(result.ENV).toBe('prod')
  })

  it('rejects invalid enum', () => {
    expect(() => validateEnv(
      { ENV: schema(mockParseEnum(['dev', 'prod'])) },
      { ENV: 'staging' },
    )).toThrow('Must be one of')
  })

  it('works alongside plain defaults', () => {
    const result = validateEnv(
      {
        PORT: schema(mockParseNumber),
        HOST: 'localhost',
        DEBUG: false,
      },
      { PORT: '8080' },
    )
    expect(result.PORT).toBe(8080)
    expect(result.HOST).toBe('localhost')
    expect(result.DEBUG).toBe(false)
  })
})

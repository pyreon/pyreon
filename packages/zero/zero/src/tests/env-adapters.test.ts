import { describe, expect, it } from 'vitest'
import { validateEnv } from '../env'
import { arktype } from '../env-arktype'
import { valibot } from '../env-valibot'
import { zod } from '../env-zod'

// ─── Zod adapter (duck-typed mock) ──────────────────────────────────────────

function mockZodString() {
  return {
    safeParse(data: unknown) {
      if (typeof data === 'string' && data.length > 0) {
        return { success: true, data }
      }
      return { success: false, error: { issues: [{ message: 'Expected string' }] } }
    },
  }
}

function mockZodNumber() {
  return {
    safeParse(data: unknown) {
      const n = Number(data)
      if (!Number.isNaN(n)) return { success: true, data: n }
      return { success: false, error: { issues: [{ message: 'Expected number' }] } }
    },
  }
}

function mockZodDefault(inner: any, defaultValue: any) {
  return {
    _def: { typeName: 'ZodDefault' },
    safeParse(data: unknown) {
      if (data === undefined || data === null) return { success: true, data: defaultValue }
      return inner.safeParse(data)
    },
  }
}

describe('zod env adapter', () => {
  it('validates string', () => {
    const result = validateEnv(
      { NAME: zod(mockZodString()) },
      { NAME: 'hello' },
    )
    expect(result.NAME).toBe('hello')
  })

  it('throws on invalid', () => {
    expect(() => validateEnv(
      { NAME: zod(mockZodString()) },
      { NAME: '' },
    )).toThrow('NAME')
  })

  it('coerces number', () => {
    const result = validateEnv(
      { PORT: zod(mockZodNumber()) },
      { PORT: '3000' },
    )
    expect(result.PORT).toBe(3000)
  })

  it('handles default value', () => {
    const result = validateEnv(
      { PORT: zod(mockZodDefault(mockZodNumber(), 8080)) },
      {},
    )
    expect(result.PORT).toBe(8080)
  })
})

// ─── Valibot adapter (duck-typed mock) ──────────────────────────────────────

function mockValibotSafeParse(schema: any, input: unknown) {
  if (schema.type === 'string') {
    if (typeof input === 'string') return { success: true, output: input }
    return { success: false, issues: [{ message: 'Expected string' }] }
  }
  if (schema.type === 'number') {
    const n = Number(input)
    if (!Number.isNaN(n)) return { success: true, output: n }
    return { success: false, issues: [{ message: 'Expected number' }] }
  }
  return { success: true, output: input }
}

describe('valibot env adapter', () => {
  it('validates string', () => {
    const result = validateEnv(
      { NAME: valibot({ type: 'string' }, mockValibotSafeParse) },
      { NAME: 'world' },
    )
    expect(result.NAME).toBe('world')
  })

  it('throws on missing', () => {
    expect(() => validateEnv(
      { NAME: valibot({ type: 'string' }, mockValibotSafeParse) },
      {},
    )).toThrow('NAME')
  })

  it('validates number', () => {
    const result = validateEnv(
      { PORT: valibot({ type: 'number' }, mockValibotSafeParse) },
      { PORT: '3000' },
    )
    expect(result.PORT).toBe(3000)
  })
})

// ─── ArkType adapter (duck-typed mock) ───────────────────────────────────────

function mockArkString(data: unknown) {
  if (typeof data === 'string') return data
  const errors = [{ message: 'must be a string' }]
  ;(errors as any).summary = 'must be a string'
  return errors
}

function mockArkUrl(data: unknown) {
  if (typeof data === 'string') {
    try { new URL(data); return data } catch {}
  }
  const errors = [{ message: 'must be a URL' }]
  ;(errors as any).summary = 'must be a URL'
  return errors
}

describe('arktype env adapter', () => {
  it('validates string', () => {
    const result = validateEnv(
      { NAME: arktype(mockArkString) },
      { NAME: 'hello' },
    )
    expect(result.NAME).toBe('hello')
  })

  it('throws on missing', () => {
    expect(() => validateEnv(
      { NAME: arktype(mockArkString) },
      {},
    )).toThrow('NAME')
  })

  it('validates URL', () => {
    const result = validateEnv(
      { API: arktype(mockArkUrl) },
      { API: 'https://api.example.com' },
    )
    expect(result.API).toBe('https://api.example.com')
  })

  it('throws on invalid URL', () => {
    expect(() => validateEnv(
      { API: arktype(mockArkUrl) },
      { API: 'not-a-url' },
    )).toThrow('must be a URL')
  })
})

/**
 * Standard Schema duck-typing — validateAgainstSchema works against
 * any spec-compliant validator. We use ad-hoc fake schemas here to
 * avoid pulling zod/valibot as test deps.
 */
import { describe, expect, it } from 'vitest'
import {
  formatIssuePath,
  formatSchemaIssues,
  isStandardSchema,
  validateAgainstSchema,
} from '../schema-validate'

function makeSchema(spec: {
  vendor?: string
  validate: (input: unknown) => unknown
}) {
  return {
    '~standard': {
      version: 1 as const,
      vendor: spec.vendor ?? 'fake',
      validate: spec.validate as never,
    },
  }
}

describe('isStandardSchema', () => {
  it.each([
    [makeSchema({ validate: () => ({ value: 1 }) }), true],
    [{}, false],
    [null, false],
    [{ '~standard': {} }, false],
    [{ '~standard': { validate: 'not a function' } }, false],
    [{ '~standard': { validate: () => ({}) } }, true],
  ])('isStandardSchema(%j) === %j', (input, expected) => {
    expect(isStandardSchema(input)).toBe(expected)
  })
})

describe('validateAgainstSchema', () => {
  it('returns ok=true with the value when validation passes', async () => {
    const schema = makeSchema({
      validate: (input) => ({ value: input }),
    })
    const result = await validateAgainstSchema(schema, { x: 1 })
    expect(result.ok).toBe(true)
    expect(result.value).toEqual({ x: 1 })
    expect(result.issues).toEqual([])
  })

  it('returns ok=false with issues when validation fails', async () => {
    const schema = makeSchema({
      validate: () => ({
        issues: [{ message: 'title is required', path: ['title'] }],
      }),
    })
    const result = await validateAgainstSchema(schema, {})
    expect(result.ok).toBe(false)
    expect(result.value).toBeNull()
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]!.message).toBe('title is required')
  })

  it('handles async validators', async () => {
    const schema = makeSchema({
      validate: async (input) => ({ value: input }),
    })
    const result = await validateAgainstSchema(schema, 'x')
    expect(result.ok).toBe(true)
    expect(result.value).toBe('x')
  })
})

describe('formatIssuePath', () => {
  it.each([
    [undefined, ''],
    [[], ''],
    [['title'], 'title'],
    [['author', 'name'], 'author.name'],
    [[{ key: 'wrapped' }], 'wrapped'],
    [[{ key: 'a' }, 'b'], 'a.b'],
    [['arr', 0], 'arr.0'],
  ])('formatIssuePath(%j) === %j', (input, expected) => {
    expect(formatIssuePath(input)).toBe(expected)
  })
})

describe('formatSchemaIssues', () => {
  it('renders a multi-line error message', () => {
    const msg = formatSchemaIssues(
      [
        { message: 'expected string', path: ['title'] },
        { message: 'expected number', path: ['order'] },
      ],
      'src/content/docs/x.md',
      'docs',
    )
    expect(msg).toContain('src/content/docs/x.md')
    expect(msg).toContain('collection "docs"')
    expect(msg).toContain('(2 issues)')
    expect(msg).toContain('- title: expected string')
    expect(msg).toContain('- order: expected number')
  })

  it('uses singular noun for one issue', () => {
    const msg = formatSchemaIssues(
      [{ message: 'oops', path: ['x'] }],
      'x.md',
      'docs',
    )
    expect(msg).toContain('(1 issue)')
  })

  it('omits path prefix when no path is present', () => {
    const msg = formatSchemaIssues(
      [{ message: 'oops' }],
      'x.md',
      'docs',
    )
    expect(msg).toContain('  - oops')
    expect(msg).not.toContain(': oops')
  })
})

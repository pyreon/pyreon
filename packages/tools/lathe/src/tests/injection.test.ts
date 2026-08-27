/**
 * A generator emits SOURCE from strings a spec controls, so every one of those
 * strings is an injection surface. Flagged by CodeQL as "code construction
 * depends on an improperly sanitized value", and three of them were real.
 *
 * These specs EXECUTE the emitted module and assert nothing injected ran.
 * Inspecting the string is not enough -- the payloads below all produce output
 * that reads perfectly plausibly.
 */
import { s } from '@pyreon/validate'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { q, safeBlockComment, safeLineComment } from '../emit/writer'

const CR = String.fromCharCode(13)
const LS = String.fromCharCode(0x2028)

/** A spec whose every author-controlled string carries a payload. */
function hostileSpec(): string {
  return JSON.stringify({
    openapi: '3.0.3',
    // A newline ENDS a `//` comment, so this lands in code position.
    info: { title: `T\nglobalThis.__TITLE_PWNED = 1;//`, version: '1' },
    servers: [{ url: 'https://e.test' }],
    paths: {
      '/x': {
        get: {
          operationId: 'getX',
          tags: ['x'],
          // `*/` ends a JSDoc block, so this lands in code position.
          summary: 'sum */ globalThis.__SUMMARY_PWNED = 1; /*',
          responses: {
            '200': {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/E' } } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        E: {
          type: 'object',
          description: 'desc */ globalThis.__DESC_PWNED = 1; /*',
          required: ['a'],
          properties: {
            a: {
              type: 'string',
              // Quote breakout, plus the three line terminators that are not `\n`.
              enum: ["'); globalThis.__ENUM_PWNED = 1; ('", `cr${CR}here`, `ls${LS}here`],
            },
          },
        },
      },
    },
  })
}

const PAYLOADS = ['__TITLE_PWNED', '__SUMMARY_PWNED', '__DESC_PWNED', '__ENUM_PWNED']

/** Evaluate an emitted schema module; returns any global the payloads set. */
function executeAndCatchInjection(source: string): string[] {
  const body = source
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export type .*$/gm, '')
    .replace(/^export const /gm, 'const ')
  const names = [...source.matchAll(/^export const (\w+)/gm)].map((m) => m[1] as string)
  for (const p of PAYLOADS) delete (globalThis as Record<string, unknown>)[p]
  // eslint-disable-next-line no-new-func
  new Function('s', `${body}\nreturn { ${names.join(', ')} }`)(s)
  return PAYLOADS.filter((p) => (globalThis as Record<string, unknown>)[p] !== undefined)
}

describe('spec-controlled strings cannot inject code', () => {
  const files = generate(
    hostileSpec(),
    resolveConfig({ input: 'x', plugins: ['types', 'schemas', 'client', 'queries', 'mocks', 'atlas'] }),
  ).files

  it('emits every file without a payload reaching code position', () => {
    for (const f of files) {
      // No block comment may CLOSE mid-line: that is the JSDoc breakout.
      expect(f.contents, `${f.path} closes a doc block`).not.toMatch(/^ \*.*\*\//m)
      // A `//` line must not be followed by an injected statement.
      const lines = f.contents.split('\n')
      for (const [i, line] of lines.entries()) {
        if (!line.startsWith('//')) continue
        const next = lines[i + 1] ?? ''
        // A payload still INSIDE a comment is contained; only one that reached
        // code position matters.
        if (next.startsWith('//') || next.trimStart().startsWith('*')) continue
        expect(next, `${f.path}:${i + 2} escaped a line comment`).not.toContain('_PWNED')
      }
    }
  })

  it('EXECUTES the emitted schema module and nothing injected runs', () => {
    const schemas = files.find((f) => f.path === 'schemas.ts')
    expect(schemas).toBeDefined()
    expect(executeAndCatchInjection(schemas!.contents)).toEqual([])
  })

  it('carries no RAW line terminator into a string literal', () => {
    // `\r`, U+2028 and U+2029 are line terminators in JS source exactly as `\n`
    // is, so an unescaped one ends the literal.
    for (const f of files) {
      expect(f.contents.includes(CR), `${f.path} has a raw CR`).toBe(false)
      expect(f.contents.includes(LS), `${f.path} has a raw U+2028`).toBe(false)
    }
  })

  it('round-trips the value it escaped', () => {
    // Escaping must not silently CHANGE the data -- a dropped character is a
    // wrong schema, which is worse than an ugly one.
    for (const value of ["it's", `a${CR}b`, `a${LS}b`, 'back\\slash', 'tab\there']) {
      // eslint-disable-next-line no-new-func
      expect(new Function(`return ${q(value)}`)()).toBe(value)
    }
  })

  describe('the sanitizers themselves', () => {
    it('safeBlockComment removes every comment terminator', () => {
      expect(safeBlockComment('a */ b')).not.toContain('*/')
      expect(safeBlockComment('a */ b */ c')).not.toContain('*/')
      // Still readable rather than mangled beyond recognition.
      expect(safeBlockComment('a */ b')).toContain('b')
    })

    it('safeLineComment collapses everything that ends a line comment', () => {
      for (const t of ['\n', CR, LS, String.fromCharCode(0x2029)]) {
        expect(safeLineComment(`a${t}b`)).toBe('a b')
      }
    })
  })
})

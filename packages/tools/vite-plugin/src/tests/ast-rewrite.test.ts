import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { foldNodeEnvProduction, renameCompatJsxAttributes } from '../ast-rewrite'

// The fold and the compat attribute rename were raw-text rewrites. Every case
// here is text that LOOKS like the target but is not an expression/attribute.

function parses(code: string, id: string): boolean {
  const lang = id.endsWith('x') ? (id.endsWith('tsx') ? 'tsx' : 'jsx') : id.endsWith('.ts') ? 'ts' : 'js'
  return parseSync(id, code, { sourceType: 'module', lang }).errors.length === 0
}

function fold(code: string, id = '/x.js'): string {
  const out = foldNodeEnvProduction(code, id) ?? code
  expect(parses(out, id), `output must parse:\n${out}`).toBe(true)
  return out
}

describe('foldNodeEnvProduction — text that is NOT a read stays byte-identical', () => {
  const cases: Record<string, string> = {
    'quoted object key (issue #3791)': `export const define = { "process.env.NODE_ENV": "production" }`,
    'single-quoted key': `const d = { 'process.env.NODE_ENV': 1 }`,
    'double-quoted string': `const s = "process.env.NODE_ENV"`,
    'single-quoted string': `const s = 'x process.env.NODE_ENV y'`,
    'line comment': `// process.env.NODE_ENV\nconst a = 1`,
    'block comment': `/* process.env.NODE_ENV */ const a = 1`,
    'regex literal': `const r = /process.env.NODE_ENV/g`,
    'template text': 'const t = `process.env.NODE_ENV`',
    'assignment target': `process.env.NODE_ENV = 'test'`,
    'update target': `process.env.NODE_ENV++`,
    'delete target': `delete process.env.NODE_ENV`,
    'destructuring assignment target': `;[process.env.NODE_ENV] = ['a']`,
    'object destructuring assignment target': `;({ a: process.env.NODE_ENV } = o)`,
    'for-of target': `for (process.env.NODE_ENV of xs) {}`,
    'user env object': `const e = other.env.NODE_ENV`,
    'dynamic key': `const e = process.env[k]`,
  }
  for (const [name, src] of Object.entries(cases)) {
    it(name, () => {
      expect(foldNodeEnvProduction(src, '/x.js')).toBeNull()
    })
  }
})

describe('foldNodeEnvProduction — real reads fold, siblings survive', () => {
  it('the issue repro: key preserved, read folded, valid JS, same length', () => {
    const src = `export const define = { "process.env.NODE_ENV": "production" }; export const mode = process.env.NODE_ENV;`
    const out = fold(src)
    expect(out).toContain(`{ "process.env.NODE_ENV": "production" }`)
    expect(out).toContain(`mode = (      "production");`)
    expect(out.length).toBe(src.length)
  })

  it('reads in every expression position', () => {
    const src = [
      `const a = process.env.NODE_ENV !== 'production'`,
      `const b = process.env.NODE_ENV === 'x' ? 1 : 2`,
      `const c = typeof process.env.NODE_ENV`,
      `const d = process.env.NODE_ENV.length`,
      `const e = f(process.env.NODE_ENV)`,
      `const { length } = process.env.NODE_ENV`,
      `const g = process.env?.NODE_ENV`,
      `const h = process?.env?.NODE_ENV`,
      `const i = process?.env.NODE_ENV`,
      `const j = process.env['NODE_ENV']`,
      `const k = process['env']['NODE_ENV']`,
      `const l = globalThis.process.env.NODE_ENV`,
      `const m = process.env.NODE_ENV ?? 'x'`,
      `const n = () => { function inner() { return process.env.NODE_ENV } return inner }`,
      `const o = { x: process.env.NODE_ENV, [process.env.NODE_ENV]: 1 }`,
      `process.env.NODE_ENV.x = 1`,
    ].join('\n')
    const out = fold(src)
    expect(out).not.toMatch(/process\??\.?(\['env'\]|env)/)
    expect(out.match(/"production"/g)).toHaveLength(17)
    expect(out.split('\n').map((l) => l.length)).toEqual(src.split('\n').map((l) => l.length))
  })

  it('quoted text and a real read in the same line', () => {
    const src = `const a = "process.env.NODE_ENV" + process.env.NODE_ENV + 'process.env.NODE_ENV' + /process.env.NODE_ENV/.source`
    const out = fold(src)
    expect(out.match(/"process\.env\.NODE_ENV"/g)).toHaveLength(1)
    expect(out).toContain(`'process.env.NODE_ENV'`)
    expect(out).toContain('/process.env.NODE_ENV/.source')
    expect(out.match(/"production"/g)).toHaveLength(1)
  })

  it('template text is preserved, interpolation folds', () => {
    const src = 'const t = `process.env.NODE_ENV=${process.env.NODE_ENV}`'
    const out = fold(src)
    expect(out).toContain('`process.env.NODE_ENV=${')
    expect(out).toContain('"production"')
  })

  it('comments are preserved around a real read', () => {
    const out = fold(`/* process.env.NODE_ENV */ const a = process.env.NODE_ENV // process.env.NODE_ENV`)
    expect(out.match(/process\.env\.NODE_ENV/g)).toHaveLength(2)
    expect(out).toContain('"production"')
  })

  it('a read spanning lines keeps the line count', () => {
    const src = `const a = process\n  .env\n  .NODE_ENV\nconst b = 1`
    const out = fold(src)
    expect(out.split('\n')).toHaveLength(src.split('\n').length)
    expect(out).toContain('"production"')
  })

  it('folded value evaluates to "production"', () => {
    const out = fold(`export function f() { return process.env.NODE_ENV }`)
    expect(new Function(`${out.replace('export ', '')}; return f()`)()).toBe('production')
  })

  it('TS and TSX/JSX sources', () => {
    const ts = fold(`const m: string = (process.env.NODE_ENV as string); const s = "process.env.NODE_ENV"`, '/x.ts')
    expect(ts).toContain('"production"')
    expect(ts).toContain('const s = "process.env.NODE_ENV"')
    const tsx = fold(
      `export const C = () => <div title="process.env.NODE_ENV" data-m={process.env.NODE_ENV}>{process.env.NODE_ENV}</div>`,
      '/x.tsx',
    )
    expect(tsx).toContain('title="process.env.NODE_ENV"')
    expect(tsx.match(/"production"/g)).toHaveLength(2)
  })

  it('skips parsing when the file has no NODE_ENV', () => {
    expect(foldNodeEnvProduction('this is not valid ((', '/x.js')).toBeNull()
  })

  it('an unparsable module is left with its runtime read (never invalid output)', () => {
    expect(foldNodeEnvProduction('const a = process.env.NODE_ENV +', '/x.js')).toBeNull()
  })
})

describe('renameCompatJsxAttributes', () => {
  it('renames only JSX attribute names', () => {
    const out = renameCompatJsxAttributes(
      `const className = 'a'\n// className = x\nconst s = " className = 1"\nexport const C = () => <label className={className} htmlFor="x">y</label>`,
      '/x.tsx',
    )
    expect(out).toContain(`const className = 'a'`)
    expect(out).toContain('// className = x')
    expect(out).toContain(`" className = 1"`)
    expect(out).toContain('<label class={className} for="x">')
  })

  it('returns the input untouched when there is nothing to rename', () => {
    const src = `const x = 1`
    expect(renameCompatJsxAttributes(src, '/x.tsx')).toBe(src)
  })
})

/**
 * The docs page runs: every `expr // → output` line in its code fences, and every row of its
 * "Coming from" table (the "Use" cell evaluated, the "Result" cell compared), is checked against the package.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as components from '../components'
import * as unitsModule from '../units'
import * as format from '../index'
import { _resetLocaleState } from '../locale'

const PAGE = join(dirname(fileURLToPath(import.meta.url)), '../../../../../docs/src/content/docs/format.md')
const page = readFileSync(PAGE, 'utf8')
const norm = (v: unknown): unknown => (typeof v === 'string' ? v.replace(/[   ]/g, ' ') : Array.isArray(v) ? v.map(norm) : v)
const strip = (t: string): string => t.replace(/\((\w+): [^)=]+\)/g, '($1)')

afterEach(() => _resetLocaleState())

describe('docs/format.md examples', () => {
  const blocks = [...page.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => (m[1] as string).split('\n'))
  const runnable = blocks.filter((b) => b.some((l) => l.includes(' // → ')))

  it('has many verified lines', () => {
    expect(runnable.flat().filter((l) => l.includes(' // → ')).length).toBeGreaterThan(80)
  })

  it.each(runnable.map((b, i) => [i, b] as const))('block %d', (_i, lines) => {
    const body: string[] = []
    const expected: string[] = []
    for (const raw of lines) {
      if (/^import\s/.test(raw)) continue
      const line = strip(raw)
      const at = line.indexOf(' // → ')
      if (at === -1) {
        body.push(line.replace(/\s+\/\/.*$/, ''))
        continue
      }
      const expr = line.slice(0, at).replace(/^;/, '').trim()
      expected.push(line.slice(at + 6).trim())
      body.push(`__check(() => (${expr}))`)
    }
    const results: unknown[] = []
    // A block that imports from @pyreon/format/units runs against that entry (its formatUnit is the converting one).
    const scope: Record<string, unknown> = lines.some((l) => l.includes("from '@pyreon/format/units")) ? { ...format, ...unitsModule } : { ...format }
    new Function(...Object.keys(scope), '__check', body.join('\n'))(...Object.values(scope), (get: () => unknown) => results.push(get()))
    expected.forEach((shown, i) => expect(norm(results[i]), shown).toEqual(norm(JSON.parse(shown))))
  })

  it('every row of the "Coming from" table runs and matches', () => {
    const rows = [...page.matchAll(/^\| (.+?) \| `((?:[^`\\]|\\.)+)` \| `((?:[^`\\]|\\.)+)` \|$/gm)].filter((m) => !(m[1] as string).startsWith('Instead'))
    expect(rows.length).toBeGreaterThanOrEqual(20)
    for (const m of rows) {
      const use = (m[2] as string).replace(/\\\|/g, '|')
      const result = (m[3] as string).replace(/\\\|/g, '|')
      const actual = new Function(...Object.keys(format), `return ${use}`)(...Object.values(format))
      expect(norm(actual), use).toEqual(norm(JSON.parse(result)))
    }
  })
})

/**
 * A code block that imports from `@pyreon/format` must import every `@pyreon/format` name it uses, so a reader can copy it. A
 * name counts as used when it is called (`formatDate(`) or rendered (`<RelativeTime`). Blocks with no `@pyreon/format` import
 * are fragments and are not checked.
 */
describe('every code block imports what it uses', () => {
  const FILES = ['docs/src/content/docs/format.md', 'docs/src/content/docs/patterns/formatting.md', 'packages/fundamentals/format/README.md']
  const names = [...Object.keys(format), ...Object.keys(components), ...Object.keys(unitsModule)]

  it.each(FILES)('%s', (file) => {
    const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../../../', file), 'utf8')
    const problems: string[] = []

    for (const m of text.matchAll(/```(?:ts|tsx)\n([\s\S]*?)```/g)) {
      const code = m[1] as string
      const imports = [...code.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'(@pyreon\/format[^']*)'/gm)]

      if (imports.length === 0) continue
      const imported = new Set(imports.flatMap((i) => (i[1] as string).split(',').map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0])))
      const body = code.replace(/^import .*$/gm, '').replace(/\/\/.*$/gm, '')

      for (const name of names) {
        const used = new RegExp(`(^|[^\\w.])${name}\\(|<${name}[\\s/>]`).test(body)

        if (used && !imported.has(name)) problems.push(`${name} is used but not imported in: ${code.split('\n').find((l) => l.trim() !== '')?.slice(0, 70)}`)
      }
    }
    expect(problems).toEqual([])
  })
})

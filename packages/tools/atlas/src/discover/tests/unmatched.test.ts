/**
 * The unmatched report — making a discovery gap VISIBLE.
 *
 * A component the scanner does not recognise is not an error, it is an absence:
 * the catalog is quietly one smaller and nothing distinguishes "you have 12
 * components" from "you have 14 and I found 12". Everywhere else Atlas refuses
 * to be silent about what it did not do; discovery was the last place it was.
 *
 * The false-positive specs matter as much as the detection ones. A report that
 * fires on every provider and schema is noise, and noise is ignored — which
 * would leave the real gaps just as invisible as before.
 */
import { describe, expect, it } from 'vitest'
import { findUnmatched, formatUnmatched, pascalExports } from '../unmatched'

const files = (map: Record<string, string>) => ({
  list: Object.keys(map),
  read: (file: string) => {
    const source = map[file]
    if (source === undefined) throw new Error(`no such file ${file}`)
    return source
  },
})

describe('pascalExports', () => {
  it('sees an exported PascalCase function', () => {
    expect(pascalExports('export function Button() {}', 'a.tsx').map((c) => c.name)).toEqual([
      'Button',
    ])
  })

  it('explains a class component', () => {
    const [found] = pascalExports('export class Legacy {}', 'a.tsx')
    expect(found?.name).toBe('Legacy')
    expect(found?.reason).toContain('class component')
  })

  it('explains a re-export', () => {
    const [found] = pascalExports("export { Button } from './button'", 'a.tsx')
    expect(found?.reason).toContain('re-export')
  })

  it('explains a styled() call by name', () => {
    const [found] = pascalExports("export const Box = styled('div')", 'a.tsx')
    expect(found?.reason).toContain('styled()')
  })

  it('explains a member call — the rocketstyle shape', () => {
    const [found] = pascalExports('export const Chip = base.attrs({}).theme(() => ({}))', 'a.tsx')
    expect(found?.reason).toContain('rocketstyle')
  })

  it('ignores lowercase exports — helpers are not missing components', () => {
    expect(pascalExports('export function helper() {}\nexport const value = 1', 'a.tsx')).toEqual([])
  })

  it('ignores NON-exported declarations', () => {
    expect(pascalExports('function Button() {}\nconst Chip = 1', 'a.tsx')).toEqual([])
  })

  it('returns nothing for unparseable source rather than throwing', () => {
    // A syntax error is a different problem and not this report's to make.
    expect(() => pascalExports('export const = = =', 'a.tsx')).not.toThrow()
  })

  it('reads a .ts file as TS, not TSX', () => {
    // `<T>(x) => x` is a generic arrow in `.ts` and a JSX element in `.tsx`;
    // parsing with the wrong kind loses the file's exports entirely.
    const code = 'export const Identity = <T,>(x: T) => x\nexport function Button() {}'
    expect(pascalExports(code, 'a.ts').map((c) => c.name)).toContain('Button')
  })
})

describe('findUnmatched', () => {
  it('is SILENT for a file whose components were found', () => {
    // The false-positive case that decides whether anyone reads this report.
    const { list, read } = files({ '/p/Button.tsx': 'export function Button() {}' })
    expect(findUnmatched(list, new Set(['/p/Button.tsx']), { readSource: read })).toEqual([])
  })

  it('is SILENT for a file with nothing PascalCase in it', () => {
    const { list, read } = files({ '/p/util.ts': 'export const add = (a, b) => a + b' })
    expect(findUnmatched(list, new Set(), { readSource: read })).toEqual([])
  })

  it('reports a file that offered a component and produced none', () => {
    const { list, read } = files({ '/p/Legacy.tsx': 'export class Legacy {}' })
    const [entry] = findUnmatched(list, new Set(), { readSource: read })
    expect(entry?.file).toBe('/p/Legacy.tsx')
    expect(entry?.exports).toEqual(['Legacy'])
    expect(entry?.reason).toContain('class component')
  })

  it('lists every PascalCase export in a file, not just the first', () => {
    const { list, read } = files({
      '/p/kit.tsx': "export const A = s('div')\nexport const B = s('span')",
    })
    expect(findUnmatched(list, new Set(), { readSource: read })[0]?.exports).toEqual(['A', 'B'])
  })

  it('skips a file it cannot read rather than failing the scan', () => {
    const list = ['/p/gone.tsx']
    expect(
      findUnmatched(list, new Set(), {
        readSource: () => {
          throw new Error('ENOENT')
        },
      }),
    ).toEqual([])
  })
})

describe('formatUnmatched', () => {
  it('is empty when there is nothing to say', () => {
    expect(formatUnmatched([])).toEqual([])
  })

  it('frames it as something to look at, not a failure', () => {
    // A provider or a schema legitimately lives in this list, so a warning
    // framing would train people to ignore it.
    const lines = formatUnmatched([{ file: 'a.tsx', exports: ['Provider'] }]).join('\n')
    expect(lines).toContain('Not necessarily wrong')
    expect(lines).toContain('a component you expected in the catalog would show up')
  })

  it('prints the reason under the file it belongs to', () => {
    const lines = formatUnmatched([
      { file: 'a.tsx', exports: ['Box'], reason: 'a `styled()` component…' },
    ])
    expect(lines[1]).toContain('a.tsx')
    expect(lines[2]).toContain('styled()')
  })
})

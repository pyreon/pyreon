/**
 * `resolveSpecifier` against a REAL disk, and the lookup's remaining branches.
 *
 * The sibling suite drives the resolver through an injected fake disk, which is
 * the right seam for the walk — but it leaves the on-disk half (which extension
 * to try, and in which order) entirely unasserted, and that half is what decides
 * whether a real project's `./types` resolves at all.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'
import {
  collectImportedTypes,
  createTypeResolver,
  findTypeDeclaration,
  resolveSpecifier,
} from '../resolve-types'

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-cov-rt-'))
  dirs.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

const write = (root: string, relative: string, source: string): string => {
  const path = join(root, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source, 'utf8')
  return path
}

const parse = (file: string, source: string): ts.SourceFile =>
  ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

describe('resolveSpecifier — what is actually on disk', () => {
  it('takes an explicit extension as written', () => {
    const root = tempDir()
    const types = write(root, 'types.ts', 'export interface Props {}')
    expect(resolveSpecifier('./types.ts', join(root, 'Button.tsx'))).toBe(types)
  })

  it('rewrites `./types.js` to the TS file — how NodeNext refers to a sibling', () => {
    const root = tempDir()
    const types = write(root, 'types.ts', 'export interface Props {}')
    expect(resolveSpecifier('./types.js', join(root, 'Button.tsx'))).toBe(types)
  })

  it('rewrites `.jsx` to `.tsx`, not to `.ts`', () => {
    const root = tempDir()
    const tsx = write(root, 'widget.tsx', 'export interface Props {}')
    write(root, 'widget.ts', 'export interface Other {}')
    expect(resolveSpecifier('./widget.jsx', join(root, 'Button.tsx'))).toBe(tsx)
  })

  it('gives up on an explicit extension whose file (and twin) is absent', () => {
    // An honest undefined, not a walk into the extension list — the author
    // spelled the extension out, so guessing a different file is a wrong answer.
    const root = tempDir()
    write(root, 'other.ts', 'export interface Props {}')
    expect(resolveSpecifier('./types.js', join(root, 'Button.tsx'))).toBeUndefined()
    expect(resolveSpecifier('./types.ts', join(root, 'Button.tsx'))).toBeUndefined()
  })

  it('tries the extension list in order for a bare relative specifier', () => {
    const root = tempDir()
    const dotTs = write(root, 'a.ts', 'export interface Props {}')
    expect(resolveSpecifier('./a', join(root, 'Button.tsx'))).toBe(dotTs)

    const tsx = write(tempDir(), 'b.tsx', 'export interface Props {}')
    expect(resolveSpecifier('./b', join(tsx, '..', 'Button.tsx'))).toBe(tsx)
  })

  it('falls through to a `.d.ts` and to an index file', () => {
    const root = tempDir()
    const dts = write(root, 'a.d.ts', 'export interface Props {}')
    expect(resolveSpecifier('./a', join(root, 'Button.tsx'))).toBe(dts)

    const other = tempDir()
    const index = write(other, 'types/index.ts', 'export interface Props {}')
    expect(resolveSpecifier('./types', join(other, 'Button.tsx'))).toBe(index)
  })

  it('returns undefined when nothing on disk matches', () => {
    expect(resolveSpecifier('./nope', join(tempDir(), 'Button.tsx'))).toBeUndefined()
  })
})

describe('collectImportedTypes', () => {
  it('records the specifier per local name, and the ORIGINAL name for an alias', () => {
    const sf = parse(
      '/p/Button.tsx',
      "import type { Props as ButtonProps, Size } from './types'\nimport Default from './d'\nimport * as All from './all'\n",
    )
    const imports = collectImportedTypes(sf)
    expect(imports.bySpecifier.get('ButtonProps')).toBe('./types')
    expect(imports.bySpecifier.get('Size')).toBe('./types')
    expect(imports.originalName.get('ButtonProps')).toBe('Props')
    // No alias -> nothing recorded, so the lookup uses the local name.
    expect(imports.originalName.has('Size')).toBe(false)
  })

  it('ignores the import shapes that name no type — default and namespace', () => {
    const sf = parse('/p/Button.tsx', "import Default from './d'\nimport * as All from './all'\nimport './side-effect'\n")
    expect(collectImportedTypes(sf).bySpecifier.size).toBe(0)
  })
})

describe('findTypeDeclaration', () => {
  const sf = parse(
    '/p/types.ts',
    'export interface Props { a: string }\nexport type Alias = { b: string }\nexport type Union = "a" | "b"\n',
  )

  it('finds an interface and an object type alias', () => {
    expect(findTypeDeclaration(sf, 'Props')).toBeDefined()
    expect(findTypeDeclaration(sf, 'Alias')).toBeDefined()
  })

  it('refuses a type alias that is NOT an object — there are no members to read', () => {
    expect(findTypeDeclaration(sf, 'Union')).toBeUndefined()
  })

  it('is undefined for a name the file does not declare', () => {
    expect(findTypeDeclaration(sf, 'Missing')).toBeUndefined()
  })
})

describe('the lookup walk', () => {
  /** A fake disk whose resolver only knows exact keys. */
  const disk = (files: Record<string, string>) => ({
    readSource: (file: string): string => {
      const source = files[file]
      if (source === undefined) throw new Error(`ENOENT ${file}`)
      return source
    },
    resolveFile: (specifier: string, fromFile: string): string | undefined => {
      if (!specifier.startsWith('.')) return undefined
      const dir = fromFile.slice(0, fromFile.lastIndexOf('/'))
      const base = `${dir}/${specifier.replace(/^\.\//, '')}`
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
        if (files[candidate] !== undefined) return candidate
      }
      return undefined
    },
  })

  const imports = (source: string, file = '/p/Button.tsx') => collectImportedTypes(parse(file, source))

  it('is undefined for a type the importing file never imported', () => {
    const resolve = createTypeResolver(disk({}))
    expect(resolve('Props', imports(''), '/p/Button.tsx')).toBeUndefined()
  })

  it('is undefined when the specifier resolves to no file', () => {
    const resolve = createTypeResolver(disk({}))
    const code = "import type { Props } from './types'"
    expect(resolve('Props', imports(code), '/p/Button.tsx')).toBeUndefined()
  })

  it('hops through an INTERMEDIATE file that re-imports the type', () => {
    // Not a re-export: `middle.ts` imports the name and declares nothing, which
    // is a different branch from the barrel walk.
    const files = {
      '/p/middle.ts': "import type { Props } from './real'\nexport type { Props }",
      '/p/real.ts': 'export interface Props { label: string }',
    }
    const resolve = createTypeResolver(disk(files))
    const code = "import type { Props } from './middle'"
    expect(resolve('Props', imports(code), '/p/Button.tsx')).toBeDefined()
  })

  it('honours a RENAMING re-export (`export { Real as Props }`)', () => {
    const files = {
      '/p/barrel.ts': "export type { Real as Props } from './real'",
      '/p/real.ts': 'export interface Real { label: string }',
    }
    const resolve = createTypeResolver(disk(files))
    const code = "import type { Props } from './barrel'"
    expect(resolve('Props', imports(code), '/p/Button.tsx')).toBeDefined()
  })

  it('skips a named re-export that lists OTHER names', () => {
    const files = {
      '/p/barrel.ts': "export type { Other } from './other'\nexport type { Props } from './real'",
      '/p/real.ts': 'export interface Props { label: string }',
      '/p/other.ts': 'export interface Other { x: string }',
    }
    const resolve = createTypeResolver(disk(files))
    const code = "import type { Props } from './barrel'"
    expect(resolve('Props', imports(code), '/p/Button.tsx')).toBeDefined()
  })

  it('ignores a local `export { … }` that names no module', () => {
    // No `from`, so there is nowhere to follow — and following the file itself
    // would be an infinite hop.
    const files = { '/p/barrel.ts': 'interface Props { a: string }\nexport { Props }' }
    const resolve = createTypeResolver(disk(files))
    const code = "import type { Props } from './barrel'"
    // Declared locally, so the DIRECT lookup answers it.
    expect(resolve('Props', imports(code), '/p/Button.tsx')).toBeDefined()
  })

  it('stops at a re-export pointing somewhere that does not resolve', () => {
    const files = { '/p/barrel.ts': "export type { Props } from './gone'" }
    const resolve = createTypeResolver(disk(files))
    const code = "import type { Props } from './barrel'"
    expect(resolve('Props', imports(code), '/p/Button.tsx')).toBeUndefined()
  })

  it('returns undefined for an unparseable/unreadable target rather than throwing', () => {
    const resolve = createTypeResolver({
      readSource: () => {
        throw new Error('EISDIR')
      },
      resolveFile: () => '/p/types.ts',
    })
    const code = "import type { Props } from './types'"
    expect(resolve('Props', imports(code), '/p/Button.tsx')).toBeUndefined()
  })

  it('parses a `.tsx` target as TSX — a generic arrow there is not a JSX tag', () => {
    const files = {
      '/p/types.tsx': 'export const noop = <T,>(v: T) => v\nexport interface Props { label: string }',
    }
    const resolve = createTypeResolver(disk(files))
    const code = "import type { Props } from './types'"
    expect(resolve('Props', imports(code), '/p/Button.tsx')).toBeDefined()
  })

  it('parses each file ONCE per scan — the cache is what keeps this linear', () => {
    let reads = 0
    const files: Record<string, string> = {
      '/p/types.ts': 'export interface A { a: string }\nexport interface B { b: string }',
    }
    const resolve = createTypeResolver({
      readSource: (file: string) => {
        reads += 1
        const source = files[file]
        if (source === undefined) throw new Error(`ENOENT ${file}`)
        return source
      },
      resolveFile: () => '/p/types.ts',
    })
    const code = "import type { A, B } from './types'"
    expect(resolve('A', imports(code), '/p/Button.tsx')).toBeDefined()
    expect(resolve('B', imports(code), '/p/Card.tsx')).toBeDefined()
    expect(reads).toBe(1)
  })

  it('caches a FAILED parse too, so an unreadable file is not re-read per component', () => {
    let reads = 0
    const resolve = createTypeResolver({
      readSource: () => {
        reads += 1
        throw new Error('ENOENT')
      },
      resolveFile: () => '/p/types.ts',
    })
    const code = "import type { A, B } from './types'"
    expect(resolve('A', imports(code), '/p/Button.tsx')).toBeUndefined()
    expect(resolve('B', imports(code), '/p/Button.tsx')).toBeUndefined()
    expect(reads).toBe(1)
  })
})

describe('the workspace tier — a BARE specifier that names a sibling package', () => {
  it('resolves through the package map when the relative resolver declines', () => {
    const root = tempDir()
    write(root, 'packages/ui/package.json', JSON.stringify({ name: '@acme/ui', main: 'src/index.ts' }))
    write(root, 'packages/ui/src/index.ts', 'export interface Props { label: string }')
    const resolve = createTypeResolver({ packages: new Map([['@acme/ui', join(root, 'packages/ui')]]) })
    const code = "import type { Props } from '@acme/ui'"
    expect(resolve('Props', collectImportedTypes(parse('/p/Button.tsx', code)), '/p/Button.tsx')).toBeDefined()
  })

  it('still declines a bare specifier with NO package map — node_modules is not followed', () => {
    const resolve = createTypeResolver({})
    const code = "import type { Props } from '@acme/ui'"
    expect(resolve('Props', collectImportedTypes(parse('/p/Button.tsx', code)), '/p/Button.tsx')).toBeUndefined()
  })
})

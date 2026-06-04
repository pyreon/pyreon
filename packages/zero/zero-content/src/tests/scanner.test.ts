/**
 * `src/mdx/` convention scanner — discovers PascalCase exports across
 * a directory tree and renders the `virtual:zero-content/components`
 * module body.
 *
 * Tests cover: PascalCase detection across `const` / `function` /
 * `default` / `{...}` export forms, `_`-prefixed file exclusion,
 * subdirectory traversal, duplicate-name detection, and the virtual
 * module's rendered output shape.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  extractPascalExports,
  isPascalCase,
  renderVirtualModule,
  scanMdxComponents,
  scanMdxDir,
} from '../mdx-scan/scanner'

describe('isPascalCase', () => {
  it.each([
    ['Hello', true],
    ['HelloWorld', true],
    ['A', true],
    ['hello', false],
    ['hELLO', false],
    ['', false],
    ['123', false],
    ['_Hidden', false],
  ])('isPascalCase(%j) === %j', (input, expected) => {
    expect(isPascalCase(input)).toBe(expected)
  })
})

describe('extractPascalExports', () => {
  it('finds `export const FooBar = ...`', () => {
    const out = extractPascalExports(
      'export const FooBar = () => null',
      '/abs/x.tsx',
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.name).toBe('FooBar')
    expect(out[0]!.kind).toBe('named')
  })

  it('finds `export function FooBar() {}`', () => {
    const out = extractPascalExports(
      'export function FooBar() { return null }',
      '/abs/x.tsx',
    )
    expect(out[0]!.name).toBe('FooBar')
    expect(out[0]!.kind).toBe('named')
  })

  it('finds `export default function FooBar() {}` as a default export', () => {
    const out = extractPascalExports(
      'export default function FooBar() { return null }',
      '/abs/x.tsx',
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.name).toBe('FooBar')
    expect(out[0]!.kind).toBe('default')
  })

  it('treats anonymous default exports as a default export named after the file', () => {
    const out = extractPascalExports(
      'export default () => null',
      '/abs/MyComponent.tsx',
    )
    expect(out[0]!.name).toBe('MyComponent')
    expect(out[0]!.kind).toBe('default')
  })

  it('ignores lowercase exports (helpers etc.)', () => {
    const out = extractPascalExports(
      'export const helper = () => null\nexport function utility() {}',
      '/abs/x.tsx',
    )
    expect(out).toEqual([])
  })

  it('finds multiple PascalCase exports in one file', () => {
    const out = extractPascalExports(
      'export const Foo = () => null\nexport function Bar() {}',
      '/abs/x.tsx',
    )
    expect(out.map((c) => c.name).sort()).toEqual(['Bar', 'Foo'])
  })

  it('handles `export { Foo, Bar }` re-export lists', () => {
    const out = extractPascalExports(
      'const Foo = () => null\nconst Bar = () => null\nexport { Foo, Bar }',
      '/abs/x.tsx',
    )
    expect(out.map((c) => c.name).sort()).toEqual(['Bar', 'Foo'])
  })

  it('handles `export { Foo as Bar }` aliased re-export', () => {
    const out = extractPascalExports(
      'const Foo = () => null\nexport { Foo as Bar }',
      '/abs/x.tsx',
    )
    expect(out[0]!.name).toBe('Bar')
    expect(out[0]!.kind).toBe('named')
  })

  it('handles `export { Foo as default }` as default export', () => {
    const out = extractPascalExports(
      'const Foo = () => null\nexport { Foo as default }',
      '/abs/x.tsx',
    )
    expect(out[0]!.name).toBe('Foo')
    expect(out[0]!.kind).toBe('default')
  })

  it('deduplicates the same name appearing multiple times', () => {
    const out = extractPascalExports(
      'export const Foo = () => null\nexport { Foo }',
      '/abs/x.tsx',
    )
    expect(out).toHaveLength(1)
  })

  it('skips anonymous default when the file basename is not PascalCase', () => {
    // `export default () => null` requires a PascalCase basename to be
    // discoverable. `helpers.tsx` is lowercase → skip.
    const out = extractPascalExports(
      'export default () => null',
      '/abs/helpers.tsx',
    )
    expect(out).toEqual([])
  })

  it('discovers anonymous default class via file basename', () => {
    const out = extractPascalExports(
      'export default class { render() {} }',
      '/abs/MyClass.tsx',
    )
    expect(out[0]!.name).toBe('MyClass')
    expect(out[0]!.kind).toBe('default')
  })

  it('discovers `export default Name;` re-export form', () => {
    const out = extractPascalExports(
      'const FooBar = () => null\nexport default FooBar;\n',
      '/abs/x.tsx',
    )
    expect(out[0]!.name).toBe('FooBar')
    expect(out[0]!.kind).toBe('default')
  })
})

describe('scanMdxDir', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-content-scanner-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeFile(rel: string, content: string) {
    const abs = path.join(tmpDir, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf8')
    return abs
  }

  it('returns empty result when directory does not exist', async () => {
    const result = await scanMdxDir(path.join(tmpDir, 'does-not-exist'))
    expect(result).toEqual({ components: [], duplicates: [], files: [] })
  })

  it('returns empty result when path is not a directory', async () => {
    const file = await writeFile('plain.txt', 'not a directory')
    const result = await scanMdxDir(file)
    expect(result).toEqual({ components: [], duplicates: [], files: [] })
  })

  it('discovers PascalCase components across multiple files', async () => {
    await writeFile('Foo.tsx', 'export const Foo = () => null')
    await writeFile('Bar.tsx', 'export default function Bar() { return null }')
    const result = await scanMdxDir(tmpDir)
    expect(result.components.map((c) => c.name)).toEqual(['Bar', 'Foo'])
  })

  it('walks subdirectories recursively', async () => {
    await writeFile('Foo.tsx', 'export const Foo = () => null')
    await writeFile('nested/Bar.tsx', 'export const Bar = () => null')
    await writeFile('a/b/c/Deep.tsx', 'export const Deep = () => null')
    const result = await scanMdxDir(tmpDir)
    expect(result.components.map((c) => c.name).sort()).toEqual(['Bar', 'Deep', 'Foo'])
  })

  it('excludes `_`-prefixed files', async () => {
    await writeFile('Foo.tsx', 'export const Foo = () => null')
    await writeFile('_Internal.tsx', 'export const Internal = () => null')
    const result = await scanMdxDir(tmpDir)
    expect(result.components.map((c) => c.name)).toEqual(['Foo'])
  })

  it('records duplicates without crashing', async () => {
    await writeFile('A.tsx', 'export const Foo = () => null')
    await writeFile('B.tsx', 'export const Foo = () => null')
    const result = await scanMdxDir(tmpDir)
    expect(result.duplicates).toHaveLength(1)
    expect(result.duplicates[0]!.name).toBe('Foo')
    expect(result.duplicates[0]!.files).toHaveLength(2)
    // Keeps the first occurrence so the build proceeds.
    expect(result.components.map((c) => c.name)).toEqual(['Foo'])
  })

  it('skips files that have no PascalCase exports', async () => {
    await writeFile('Foo.tsx', 'export const Foo = () => null')
    await writeFile('utils.ts', 'export const helper = () => null')
    const result = await scanMdxDir(tmpDir)
    expect(result.components.map((c) => c.name)).toEqual(['Foo'])
    expect(result.files).toHaveLength(1)
  })

  it('walks .ts / .tsx / .js / .jsx files', async () => {
    await writeFile('A.ts', 'export const A = 1')
    await writeFile('B.tsx', 'export const B = () => null')
    await writeFile('C.js', 'export const C = () => null')
    await writeFile('D.jsx', 'export const D = () => null')
    const result = await scanMdxDir(tmpDir)
    expect(result.components.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('scanMdxComponents (convenience wrapper)', () => {
  it('resolves <root>/src/mdx and scans it', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zero-content-conv-'),
    )
    try {
      const mdxDir = path.join(tmpDir, 'src', 'mdx')
      await fs.mkdir(mdxDir, { recursive: true })
      await fs.writeFile(
        path.join(mdxDir, 'Foo.tsx'),
        'export const Foo = () => null',
        'utf8',
      )
      const result = await scanMdxComponents(tmpDir)
      expect(result.components.map((c) => c.name)).toEqual(['Foo'])
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})

describe('renderVirtualModule', () => {
  it('emits empty re-export when no components are scanned', () => {
    const out = renderVirtualModule({ components: [], duplicates: [], files: [] })
    expect(out).toContain('export {}')
    expect(out).toContain('No src/mdx/ components found')
  })

  it('emits per-component imports + a default __components map', () => {
    const out = renderVirtualModule({
      components: [
        { name: 'Foo', filePath: '/abs/Foo.tsx', kind: 'named' },
        { name: 'Bar', filePath: '/abs/Bar.tsx', kind: 'default' },
      ],
      duplicates: [],
      files: ['/abs/Foo.tsx', '/abs/Bar.tsx'],
    })
    expect(out).toContain('import { Foo as __c0 } from "/abs/Foo.tsx"')
    expect(out).toContain('import __c1 from "/abs/Bar.tsx"')
    expect(out).toContain('export default __components')
    expect(out).toContain('export const Foo = __components.Foo')
    expect(out).toContain('export const Bar = __components.Bar')
    expect(out).toContain('export const __components_meta__ = ["Foo","Bar"]')
  })
})

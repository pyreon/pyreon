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
  it('re-exports the built-in components even when no user components are scanned', () => {
    // The markdown compiler emits `<Callout>` / `<CodeGroup>` /
    // `<CodeBlock>` references via mdxComponentRef → `compileMarkdown`
    // generates `import { CodeBlock } from
    // 'virtual:zero-content/components'`. Even on a project with no
    // `src/mdx/` directory the virtual module MUST re-export those
    // three built-ins, otherwise the compiled .tsx fails with
    // `MISSING_EXPORT "CodeBlock"`.
    const out = renderVirtualModule({ components: [], duplicates: [], files: [] })
    expect(out).toContain("from '@pyreon/zero-content'")
    expect(out).toContain('export const Callout = __components.Callout')
    expect(out).toContain('export const CodeGroup = __components.CodeGroup')
    expect(out).toContain('export const CodeBlock = __components.CodeBlock')
    // Canonical alphabetical order — locked in `_shared/built-ins.ts`
    // so the scanner + validator can't drift. Was `[Callout, CodeGroup,
    // CodeBlock]` pre-PR-A L10 fix when each side had its own list.
    // PR-K audit H2 (APICard/CompatMatrix/PackageBadge/Playground/
    // PropTable/Tabs) + PR-M audit M6+M7+M8 (Details/Math/Mermaid).
    expect(out).toContain(
      'export const __components_meta__ = ["APICard","Callout","CodeBlock","CodeGroup","CompatMatrix","Details","Math","Mermaid","PackageBadge","Playground","PropTable","Tabs"]',
    )
  })

  it('emits per-component imports + a default __components map alongside built-ins', () => {
    const out = renderVirtualModule({
      components: [
        { name: 'Foo', filePath: '/abs/Foo.tsx', kind: 'named' },
        { name: 'Bar', filePath: '/abs/Bar.tsx', kind: 'default' },
      ],
      duplicates: [],
      files: ['/abs/Foo.tsx', '/abs/Bar.tsx'],
    })
    // Built-ins re-exported via aliased imports __b0..__b11 in
    // alphabetical order (single-source-of-truth from `_shared`).
    // PR-K (H2) + PR-M (M6+M7+M8) — built-ins now total 12.
    expect(out).toContain("import { APICard as __b0 } from '@pyreon/zero-content'")
    expect(out).toContain("import { Callout as __b1 } from '@pyreon/zero-content'")
    expect(out).toContain("import { CodeBlock as __b2 } from '@pyreon/zero-content'")
    expect(out).toContain("import { CodeGroup as __b3 } from '@pyreon/zero-content'")
    expect(out).toContain("import { CompatMatrix as __b4 } from '@pyreon/zero-content'")
    expect(out).toContain("import { Details as __b5 } from '@pyreon/zero-content'")
    expect(out).toContain("import { Math as __b6 } from '@pyreon/zero-content'")
    expect(out).toContain("import { Mermaid as __b7 } from '@pyreon/zero-content'")
    expect(out).toContain("import { Tabs as __b11 } from '@pyreon/zero-content'")
    // User scan continues at __c12 / __c13 (idx starts after 12 built-ins).
    expect(out).toContain('import { Foo as __c12 } from "/abs/Foo.tsx"')
    expect(out).toContain('import __c13 from "/abs/Bar.tsx"')
    expect(out).toContain('export default __components')
    expect(out).toContain('export const Foo = __components.Foo')
    expect(out).toContain('export const Bar = __components.Bar')
    expect(out).toContain('export const Callout = __components.Callout')
    expect(out).toContain(
      'export const __components_meta__ = ["APICard","Callout","CodeBlock","CodeGroup","CompatMatrix","Details","Math","Mermaid","PackageBadge","Playground","PropTable","Tabs","Foo","Bar"]',
    )
  })

  it('user-scanned components override built-ins of the same name (escape hatch)', () => {
    // A project wanting a custom Callout drops `src/mdx/Callout.tsx`;
    // the user-scanned export takes precedence over the built-in
    // re-export so there's no duplicate-export crash.
    const out = renderVirtualModule({
      components: [
        { name: 'Callout', filePath: '/abs/Callout.tsx', kind: 'default' },
      ],
      duplicates: [],
      files: ['/abs/Callout.tsx'],
    })
    // Built-in Callout NOT imported.
    expect(out).not.toContain("import { Callout as __b")
    // User Callout IS imported. With 11 built-ins remaining
    // (Callout removed from the 12-entry list), the user import
    // lands at idx 11 (`__c11`).
    expect(out).toContain('import __c11 from "/abs/Callout.tsx"')
    expect(out).toContain('export const Callout = __components.Callout')
    // Other built-ins still re-exported.
    expect(out).toContain("import { CodeGroup as __b")
    expect(out).toContain("import { CodeBlock as __b")
  })
})

/**
 * Packaging lock for the ambient image-import types.
 *
 * `@pyreon/zero` documents `import hero from './x.jpg?optimize'` and
 * ships the correct ambient declarations — but the feature only works
 * for a consumer if (a) `package.json` `exports` makes
 * `@pyreon/zero/image-types` resolvable so the documented
 * `/// <reference types="@pyreon/zero/image-types" />` works, AND it
 * builds: `vl_rolldown_build` derives a build ENTRY from every exports
 * subpath, so the source must be a real buildable `src/image-types.ts`
 * (a hand-authored `.d.ts` made the zero build fail with
 * `[UNRESOLVED_ENTRY] src/image-types.ts`). And (b) the `ProcessedImage`
 * import must be resolution-stable in the PUBLISHED layout (the package
 * self-ref `@pyreon/zero/image-plugin`, not a relative `./image-plugin`
 * that drags the full src `.ts`).
 *
 * All three were missing/fragile — this test pins them.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'))

describe('@pyreon/zero/image-types — ambient query types ship + build out of the box', () => {
  it('exports ./image-types as a real build entry (bun/import/types), mirroring ./client', () => {
    const entry = pkg.exports['./image-types']
    expect(entry).toBeDefined()
    // Must be a buildable entry, NOT a bare types-only `.d.ts` — the
    // latter makes `vl_rolldown_build` fail (UNRESOLVED_ENTRY).
    expect(entry.bun).toBe('./src/image-types.ts')
    expect(entry.import).toBe('./lib/image-types.js')
    expect(entry.types).toBe('./lib/types/image-types.d.ts')
    expect(existsSync(join(PKG_ROOT, 'src/image-types.ts'))).toBe(true)
    // The old hand-authored .d.ts must be gone (it was the build break).
    expect(existsSync(join(PKG_ROOT, 'src/image-types.d.ts'))).toBe(false)
  })

  it('the source is published (files includes src, not excluded)', () => {
    expect(pkg.files).toContain('src')
    expect(pkg.files).not.toContain('!src/image-types.ts')
  })

  const src = readFileSync(join(PKG_ROOT, 'src/image-types.ts'), 'utf-8')

  it('has no COLUMN-0 top-level import/export (only the indented `export default` inside declare-module bodies)', () => {
    // A top-level (column-0) import/export would change the emitted
    // declaration's module-ness. The only `export` allowed is the
    // indented `  export default x` INSIDE each `declare module {}`.
    expect(src).not.toMatch(/^import\s/m)
    expect(src).not.toMatch(/^export\s/m)
  })

  it('is excluded from zero’s own tsc (moduleDetection:force would TS2664 a .ts ambient)', () => {
    const tsconfig = readFileSync(join(PKG_ROOT, 'tsconfig.json'), 'utf-8')
    // JSONC (has // comments) — assert the path is in the exclude list.
    expect(tsconfig).toMatch(/"exclude":\s*\[[^\]]*"src\/image-types\.ts"/s)
  })

  it('declares every owned query module', () => {
    for (const m of [
      "declare module '*.jpg?optimize'",
      "declare module '*.jpeg?optimize'",
      "declare module '*.png?optimize'",
      "declare module '*.webp?optimize'",
      "declare module '*.avif?optimize'",
      "declare module '*.svg?component'",
      "declare module '*.svg?raw'",
    ]) {
      expect(src).toContain(m)
    }
  })

  it('?optimize maps to ProcessedImage via the resolution-stable package self-ref', () => {
    expect(src).toContain("import('@pyreon/zero/image-plugin').ProcessedImage")
    expect(src).not.toContain("import('./image-plugin')")
  })

  it('?component maps to a Pyreon ComponentFn (self-ref), ?raw to string', () => {
    expect(src).toContain("import('@pyreon/core').ComponentFn")
    expect(src).toMatch(/declare module '\*\.svg\?raw'[\s\S]*const svg: string/)
  })
})

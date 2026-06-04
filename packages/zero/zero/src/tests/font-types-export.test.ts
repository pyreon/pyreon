/**
 * Packaging lock for the ambient `?font` import types.
 *
 * Mirrors `image-types-export.test.ts`. Three invariants pinned:
 *   (a) `package.json` `exports` makes `@pyreon/zero/font-types` resolvable
 *       so the documented `/// <reference types="@pyreon/zero/font-types" />`
 *       works in consumer projects.
 *   (b) The exports entry points at a buildable `.ts` source (not a
 *       hand-authored `.d.ts`), because `vl_rolldown_build` derives a
 *       build ENTRY from every exports subpath — a bare `.d.ts` makes
 *       the build fail with `[UNRESOLVED_ENTRY]`.
 *   (c) The `FontDescriptor` import is resolution-stable in the
 *       PUBLISHED layout (the package self-ref `@pyreon/zero/font-import-plugin`,
 *       not a relative `./font-import-plugin` that drags the full src
 *       `.ts` instead of resolving via the published exports).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'))

describe('@pyreon/zero/font-types — ambient query types ship + build out of the box', () => {
  it('exports ./font-types as a real build entry (bun/import/types)', () => {
    const entry = pkg.exports['./font-types']
    expect(entry).toBeDefined()
    expect(entry.bun).toBe('./src/font-types.ts')
    expect(entry.import).toBe('./lib/font-types.js')
    expect(entry.types).toBe('./lib/types/font-types.d.ts')
    expect(existsSync(join(PKG_ROOT, 'src/font-types.ts'))).toBe(true)
    // No stray hand-authored .d.ts (matches the image-types lesson).
    expect(existsSync(join(PKG_ROOT, 'src/font-types.d.ts'))).toBe(false)
  })

  it('exports ./font-import-plugin so the FontDescriptor import inside font-types.ts resolves', () => {
    const entry = pkg.exports['./font-import-plugin']
    expect(entry).toBeDefined()
    expect(entry.bun).toBe('./src/font-import-plugin.ts')
  })

  it('the source is published (files includes src, not excluded)', () => {
    expect(pkg.files).toContain('src')
    expect(pkg.files).not.toContain('!src/font-types.ts')
  })

  const src = readFileSync(join(PKG_ROOT, 'src/font-types.ts'), 'utf-8')

  it('has no COLUMN-0 top-level import/export — ambient script only', () => {
    // Same constraint as image-types: a top-level import/export would
    // change the file's module-ness. Only the indented `export default`
    // inside `declare module {…}` bodies is allowed.
    const lines = src.split('\n')
    const hasTopLevelImportOrExport = lines.some(
      (l) => /^(import|export)\s/.test(l) && !l.startsWith('  '),
    )
    expect(hasTopLevelImportOrExport).toBe(false)
  })

  it('declares ALL five font extensions for the ?font query', () => {
    for (const ext of ['woff2', 'woff', 'ttf', 'otf', 'eot']) {
      expect(src).toContain(`*.${ext}?font`)
    }
  })

  it('uses the package self-ref import (resolution-stable in published layout)', () => {
    // Relative imports like `import('./font-import-plugin')` would
    // drag the full src .ts on lib emit and bind ambient declarations
    // to a non-portable resolution. The self-ref `@pyreon/zero/font-import-plugin`
    // resolves via the published exports map.
    expect(src).toContain("import('@pyreon/zero/font-import-plugin').FontDescriptor")
    expect(src).not.toContain("import('./font-import-plugin')")
  })
})

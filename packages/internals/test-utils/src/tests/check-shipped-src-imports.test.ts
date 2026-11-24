import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { shippedSrcImports } from '../../../../../scripts/check-shipped-src-imports'

/**
 * `scripts/check-shipped-src-imports.ts` — nothing a package ships may import
 * from its own `src/` when the publish strips `src/` (`stripSrcFromFiles`).
 * `loom build` shipped `app/src/view.tsx` importing `../../src/ui/Observatory`
 * and failed in every install with `UNRESOLVED_IMPORT`; `atlas build` nearly
 * did the same.
 */

let roots: string[] = []
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
  roots = []
})

function pkg(manifest: Record<string, unknown>, files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'shipped-src-')))
  roots.push(dir)
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
  return dir
}

const BUILDS_TO_LIB = {
  name: '@pyreon/tool',
  exports: { './ui': { bun: './src/ui.ts', import: './lib/ui.js' } },
  files: ['app', 'bin', 'lib', 'src'],
}

describe('shippedSrcImports', () => {
  it('flags a shipped app file that imports the stripped src/, in every import form', () => {
    const dir = pkg(BUILDS_TO_LIB, {
      'app/src/view.tsx': [
        "import { Observatory } from '../../src/ui/Observatory'",
        "import type { ViewId } from '../../src/ui/model'",
        "export { x } from '../../src/x'",
        "const lazy = () => import('../../src/lazy')",
        "type T = import('../../src/ui/catalog').T",
        "import '@pyreon/tool/src/side'",
      ].join('\n'),
    })
    expect(shippedSrcImports(dir).map((v) => v.specifier)).toEqual([
      '../../src/ui/Observatory',
      '../../src/ui/model',
      '../../src/x',
      '@pyreon/tool/src/side',
      '../../src/lazy',
      '../../src/ui/catalog',
    ])
  })

  it("accepts the package's own public subpath, and relative imports inside the shipped dir", () => {
    const dir = pkg(BUILDS_TO_LIB, {
      'app/src/view.tsx': "import { Observatory } from '@pyreon/tool/ui'\nimport { h } from './helper'\n",
      'app/src/helper.ts': 'export const h = 1\n',
      'bin/tool.js': "import { run } from '../lib/cli.js'\n",
    })
    expect(shippedSrcImports(dir)).toEqual([])
  })

  it('ignores a package that ships src/ (it is not stripped) or does not build to lib/', () => {
    const view = { 'app/view.ts': "import { x } from '../src/x'\n" }
    // Builds to nothing: `src/` IS the product (the Kotlin runtimes' shape).
    expect(shippedSrcImports(pkg({ name: '@pyreon/src-pkg', files: ['app', 'src'] }, view))).toEqual([])
    // Ships src/ via a sub-path entry the strip keeps.
    expect(
      shippedSrcImports(pkg({ ...BUILDS_TO_LIB, files: ['app', 'lib', 'src/kept'] }, view)),
    ).toEqual([])
  })
})

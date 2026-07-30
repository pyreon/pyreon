/**
 * Synthetic workspace fixture — written to a TEMP directory at test time,
 * never checked into the tree (fixture package.jsons inside the repo would be
 * swept into the REAL workspace globs and every repo-wide gate — the class
 * Atlas hit with its scan fixtures).
 *
 * The fixture encodes one instance of every issue class:
 *  - version-drift: `left-pad` at ^1.0.0 (app) vs ^2.0.0 (lib) — cross-major
 *  - version-drift (warning): `chalk` at ^5.0.0 vs ^5.2.0
 *  - internal-range: app declares @fix/util as `1.0.0` (not workspace:)
 *  - cycle: @fix/auth ⇄ @fix/data (runtime)
 *  - phantom-dep: @fix/app imports `undeclared-pkg` in src
 *  - prod-import-of-dev-dep: @fix/app imports `dev-only-pkg` (devDependencies)
 *  - unused-dep: @fix/lib declares `never-imported` and imports nothing
 *  - peer-mismatch: @fix/plugin peers @fix/util@^9.0.0 (actual 1.0.0)
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2))
}

export function makeFixtureWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'loom-fixture-'))
  writeJson(join(root, 'package.json'), {
    name: 'fixture-root',
    private: true,
    workspaces: ['packages/*'],
    overrides: { 'pinned-pkg': '3.0.0' },
  })

  const pkg = (dir: string, manifest: Record<string, unknown>, files: Record<string, string> = {}) => {
    const abs = join(root, 'packages', dir)
    mkdirSync(join(abs, 'src'), { recursive: true })
    writeJson(join(abs, 'package.json'), manifest)
    for (const [rel, content] of Object.entries(files)) {
      writeFileSync(join(abs, rel), content)
    }
  }

  pkg(
    'app',
    {
      name: '@fix/app',
      version: '1.0.0',
      dependencies: {
        '@fix/util': '1.0.0', // internal-range: not workspace:
        '@fix/auth': 'workspace:*',
        'left-pad': '^1.0.0',
        chalk: '^5.0.0',
        'pinned-pkg': '^2.0.0',
      },
      devDependencies: { 'dev-only-pkg': '^1.0.0' },
    },
    {
      'src/index.ts': [
        `import { util } from '@fix/util'`,
        `import { auth } from '@fix/auth'`,
        `import { oops } from 'undeclared-pkg'`,
        `import { dev } from 'dev-only-pkg'`,
        `export const app = () => util() + auth() + oops() + dev()`,
      ].join('\n'),
    },
  )

  pkg(
    'auth',
    {
      name: '@fix/auth',
      version: '1.0.0',
      dependencies: { '@fix/data': 'workspace:*' },
    },
    { 'src/index.ts': `import '@fix/data'\nexport const auth = () => 1` },
  )

  pkg(
    'data',
    {
      name: '@fix/data',
      version: '1.0.0',
      // The cycle back-edge: data → auth at runtime.
      dependencies: { '@fix/auth': 'workspace:*' },
    },
    { 'src/index.ts': `import '@fix/auth'\nexport const data = () => 2` },
  )

  pkg(
    'util',
    {
      name: '@fix/util',
      version: '1.0.0',
      dependencies: { 'left-pad': '^2.0.0', chalk: '^5.2.0', 'never-imported': '^1.0.0', 'pinned-pkg': '^3.0.0' },
    },
    { 'src/index.ts': `export const util = () => 3` },
  )

  pkg(
    'plugin',
    {
      name: '@fix/plugin',
      version: '1.0.0',
      peerDependencies: { '@fix/util': '^9.0.0' },
    },
    {
      'src/index.ts': [
        '// a commented-out import must not count: import x from "ghost-pkg"',
        'const example = `import { y } from "template-pkg"`',
        'export const plugin = () => example',
      ].join('\n'),
    },
  )

  return root
}

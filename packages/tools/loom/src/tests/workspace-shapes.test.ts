/**
 * Workspace-declaration + lexical-scan SHAPES — the branches the main fixture
 * doesn't hit: object-form `workspaces`, pnpm YAML globs, negation globs,
 * `**` depth globs, workspace:^ pinning forms, and the stripper's string modes.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { detectInternalRange, detectVersionDrift, readWorkspaceGlobs, scanWorkspace } from '../core'
import { scanPackageImports, stripNonCode, stripWithMask } from '../core/imports'

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'loom-shape-'))
  roots.push(root)
  return root
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value))
}

describe('workspace declaration shapes', () => {
  it('object-form workspaces + pnpm-workspace.yaml merge', () => {
    const root = tempRoot()
    writeJson(join(root, 'package.json'), { name: 'r', workspaces: { packages: ['libs/*'] } })
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  # comment\n")
    mkdirSync(join(root, 'libs/a'), { recursive: true })
    writeJson(join(root, 'libs/a/package.json'), { name: 'a', version: '1.0.0' })
    mkdirSync(join(root, 'apps/b'), { recursive: true })
    writeJson(join(root, 'apps/b/package.json'), { name: 'b', version: '1.0.0' })
    expect(readWorkspaceGlobs(root).sort()).toEqual(['apps/*', 'libs/*'])
    expect(
      scanWorkspace(root)
        .packages.map((p) => p.name)
        .sort(),
    ).toEqual(['a', 'b'])
  })

  it('`**` globs match at any depth; negation globs exclude', () => {
    const root = tempRoot()
    writeJson(join(root, 'package.json'), { name: 'r', workspaces: ['pkgs/**', '!pkgs/skip'] })
    mkdirSync(join(root, 'pkgs/deep/nested'), { recursive: true })
    writeJson(join(root, 'pkgs/deep/nested/package.json'), { name: 'deep-nested', version: '1.0.0' })
    mkdirSync(join(root, 'pkgs/skip'), { recursive: true })
    writeJson(join(root, 'pkgs/skip/package.json'), { name: 'skipped', version: '1.0.0' })
    const names = scanWorkspace(root).packages.map((p) => p.name)
    expect(names).toContain('deep-nested')
    expect(names).not.toContain('skipped')
  })

  it('a nameless member manifest is skipped, not crashed on', () => {
    const root = tempRoot()
    writeJson(join(root, 'package.json'), { name: 'r', workspaces: ['p/*'] })
    mkdirSync(join(root, 'p/anon'), { recursive: true })
    writeJson(join(root, 'p/anon/package.json'), { version: '1.0.0' })
    expect(scanWorkspace(root).packages).toHaveLength(0)
  })
})

describe('internal-range shapes', () => {
  const model = (range: string, actual = '2.0.0') => ({
    root: { dir: '.', overrides: {}, workspaceGlobs: [], ignores: [], devPaths: [] },
    packages: [
      { name: 'a', version: '1.0.0', dir: 'a', private: false, deps: [{ name: 'b', range, field: 'dependencies' as const }] },
      { name: 'b', version: actual, dir: 'b', private: false, deps: [] },
    ],
  })

  it('workspace:* and bare workspace:^ forms are always fine', () => {
    expect(detectInternalRange(model('workspace:*'))).toHaveLength(0)
    expect(detectInternalRange(model('workspace:^'))).toHaveLength(0)
  })

  it('workspace:^1.0.0 against a 2.0.0 copy is the pinned-major lie', () => {
    const issues = detectInternalRange(model('workspace:^1.0.0'))
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toContain('no longer exists here')
  })

  it('workspace:^2.0.0 matching the actual major is fine', () => {
    expect(detectInternalRange(model('workspace:^2.0.0'))).toHaveLength(0)
  })
})

describe('version-drift severity shapes', () => {
  it('a STRICT-superset compatibility range downgrades to info (policy, not drift)', () => {
    const issues = detectVersionDrift(
      [{ name: 'ts', ranges: { '>=5.0.0 <7.0.0': [{ user: 'a', field: 'dependencies' }], '^6.0.3': [{ user: 'b', field: 'devDependencies' }] } }],
      {},
    )
    expect(issues[0]!.severity).toBe('info')
    expect(issues[0]!.message).toContain('compatibility range')
  })

  it('peer declarations are contracts — a wide peer next to a pinned dep is NOT drift', () => {
    const issues = detectVersionDrift(
      [{ name: 'echarts', ranges: { '>=5.6.0': [{ user: 'a', field: 'peerDependencies' }], '^6.1.0': [{ user: 'a', field: 'devDependencies' }] } }],
      {},
    )
    expect(issues).toHaveLength(0)
  })

  it('equal spans stay genuine drift (never mis-read as containment)', () => {
    const issues = detectVersionDrift(
      [{ name: 'x', ranges: { '^5.0.0': [{ user: 'a', field: 'dependencies' }], '^5.2.0': [{ user: 'b', field: 'dependencies' }] } }],
      {},
    )
    expect(issues[0]!.severity).toBe('warning')
  })

  it('the `*` star contains everything — info, never a fabricated error', () => {
    const issues = detectVersionDrift(
      [{ name: 'x', ranges: { '*': [{ user: 'a', field: 'dependencies' }], '^4.1.0': [{ user: 'b', field: 'dependencies' }] } }],
      {},
    )
    expect(issues[0]!.severity).toBe('info')
  })
})

describe('lexical stripper modes', () => {
  it('double-quoted specifiers survive; escapes inside strings are honored', () => {
    const out = stripNonCode(`import a from "kept"\nconst s = 'it\\'s fine'\n/* import b from 'block-gone' */`)
    expect(out).toContain('"kept"')
    expect(out).not.toContain('block-gone')
  })

  it('an unterminated template drops the tail instead of leaking it', () => {
    const out = stripNonCode('const t = `import x from "gone"')
    expect(out).not.toContain('gone')
  })

  it('a quoted `from` sequence INSIDE another string never scans as an import', () => {
    // The lint-rule-message / diagnose-catalog / generated-example class:
    // code-shaped prose in ordinary quotes. The statement keyword must sit
    // in CODE for the scanner to count it.
    const root = tempRoot()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src/rule.ts'),
      `const msg = "Import island from '@fake/server-client' — never from '@fake/barrel'"
import 'real-pkg'`,
    )
    const scan = scanPackageImports(root)
    expect([...scan.prod.keys()]).toEqual(['real-pkg'])
  })

  it('stripWithMask marks string contents as non-code', () => {
    const { stripped, codeAt } = stripWithMask(`import 'a'
const s = "from 'b'"`)
    const fromInString = stripped.lastIndexOf('from')
    expect(codeAt[fromInString]).toBe(false)
    expect(codeAt[0]).toBe(true) // the real import keyword
  })

  it('a subtree with its own package.json is a separate unit (not scanned)', () => {
    const root = tempRoot()
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'vscode'), { recursive: true })
    writeFileSync(join(root, 'src/a.ts'), `import 'declared-here'`)
    writeJson(join(root, 'vscode/package.json'), { name: 'nested-ext' })
    writeFileSync(join(root, 'vscode/extension.js'), `const v = require('vscode')`)
    const scan = scanPackageImports(root)
    expect(scan.prod.has('vscode')).toBe(false)
    expect(scan.prod.has('declared-here')).toBe(true)
  })

  it('scanPackageImports splits prod vs dev surfaces and caps file evidence', () => {
    const root = tempRoot()
    mkdirSync(join(root, 'src/tests'), { recursive: true })
    writeFileSync(join(root, 'src/a.ts'), `import 'prod-pkg'`)
    writeFileSync(join(root, 'src/tests/a.test.ts'), `import 'test-pkg'`)
    const scan = scanPackageImports(root)
    expect([...scan.prod.keys()]).toEqual(['prod-pkg'])
    expect([...scan.dev.keys()]).toEqual(['test-pkg'])
  })
})

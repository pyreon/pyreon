/**
 * `atlas init` — writing down what detection guessed.
 *
 * The refusal-to-overwrite specs matter most. That file is hand-edited the
 * moment it exists (a wrapper, a theme, authored scenarios), and clobbering it
 * to refresh a list of directories would be a spectacularly bad trade.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findExistingConfig, renderConfig, runInit } from '../init'
import { autoDetectProjects } from '../run'

let root: string
const write = (relative: string, source: string): void => {
  const path = join(root, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source, 'utf8')
}
const COMPONENT = 'export function Button(props: { label: string }) { return null as never }\n'

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-init-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('renderConfig', () => {
  it('nests everything under the `atlas` section', () => {
    const source = renderConfig('Acme', [
      { name: 'Core', dir: 'packages/core/src', packageName: '@acme/core' },
    ])
    expect(source).toContain('atlas: {')
    expect(source).toContain('title: "Acme"')
    expect(source).toContain('{ name: "Core", dir: "packages/core/src" }')
  })

  it('names the package each entry came from, so the list is auditable', () => {
    const source = renderConfig('Acme', [
      { name: 'Core', dir: 'packages/core/src', packageName: '@acme/core' },
    ])
    expect(source).toContain('// @acme/core')
  })

  it('omits `projects` entirely for a single-package project', () => {
    // An empty array would imply a monorepo that found nothing.
    expect(renderConfig('Solo', [])).not.toContain('projects')
  })

  it('says there are no story files, where someone will actually read it', () => {
    expect(renderConfig('Acme', [])).toContain('no story files')
  })
})

describe('runInit', () => {
  it('writes a config from the detected workspace', () => {
    write('package.json', JSON.stringify({ name: '@acme/root', workspaces: ['packages/*'] }))
    write('packages/core/package.json', JSON.stringify({ name: '@acme/design-core' }))
    write('packages/core/src/Button.tsx', COMPONENT)

    const result = runInit({ cwd: root })
    expect(result.kind).toBe('written')
    if (result.kind !== 'written') return
    expect(result.path.endsWith('pyreon.config.ts')).toBe(true)
    expect(result.projects.map((p) => p.name)).toEqual(['Design Core'])
    expect(readFileSync(result.path, 'utf8')).toContain('packages/core/src')
  })

  it('derives the title from the root package name', () => {
    write('package.json', JSON.stringify({ name: '@acme/design-system' }))
    write('src/Button.tsx', COMPONENT)
    const result = runInit({ cwd: root })
    expect(result.kind === 'written' && result.title).toBe('Design System')
  })

  it('REFUSES to overwrite an existing config', () => {
    write('pyreon.config.ts', 'export default { atlas: { title: "mine" } }\n')
    write('src/Button.tsx', COMPONENT)
    const result = runInit({ cwd: root })
    expect(result.kind).toBe('exists')
    // Untouched.
    expect(readFileSync(join(root, 'pyreon.config.ts'), 'utf8')).toContain('mine')
  })

  it('refuses when the existing config is the per-tool file too', () => {
    write('atlas.config.ts', 'export default { title: "mine" }\n')
    write('src/Button.tsx', COMPONENT)
    expect(runInit({ cwd: root }).kind).toBe('exists')
  })

  it('overwrites with --force', () => {
    write('pyreon.config.ts', 'export default { atlas: { title: "old" } }\n')
    write('package.json', JSON.stringify({ name: 'fresh' }))
    write('src/Button.tsx', COMPONENT)
    const result = runInit({ cwd: root, force: true })
    expect(result.kind).toBe('written')
    expect(readFileSync(join(root, 'pyreon.config.ts'), 'utf8')).toContain('Fresh')
  })

  it('--dry-run writes NOTHING', () => {
    write('package.json', JSON.stringify({ name: 'demo' }))
    write('src/Button.tsx', COMPONENT)
    const result = runInit({ cwd: root, dryRun: true })
    expect(result.kind).toBe('dry-run')
    expect(existsSync(join(root, 'pyreon.config.ts'))).toBe(false)
  })

  it('reports nothing-found rather than writing an empty config', () => {
    // A config claiming a project has no components is worse than no config:
    // it looks configured, so nobody checks the path.
    write('package.json', JSON.stringify({ name: 'empty' }))
    const result = runInit({ cwd: root })
    expect(result.kind).toBe('nothing-found')
    expect(existsSync(join(root, 'pyreon.config.ts'))).toBe(false)
  })
})

describe('findExistingConfig', () => {
  it('prefers pyreon.config.ts over the per-tool file', () => {
    write('pyreon.config.ts', '')
    write('atlas.config.ts', '')
    expect(findExistingConfig(root)?.endsWith('pyreon.config.ts')).toBe(true)
  })
})

describe('autoDetectProjects', () => {
  it('does NOT fire when the root already has components', () => {
    // The guard that makes this purely additive: a project that works today
    // must not have its catalog reshaped by an upgrade.
    const detected = autoDetectProjects('/repo', 'src', undefined, {
      hasComponents: () => true,
      detect: () => [{ name: 'X', dir: 'x', packageName: 'x' }],
    })
    expect(detected).toEqual([])
  })

  it('does NOT fire when projects are already declared', () => {
    const detected = autoDetectProjects('/repo', 'src', [{ name: 'Declared', dir: 'a' }], {
      hasComponents: () => false,
      detect: () => [{ name: 'X', dir: 'x', packageName: 'x' }],
    })
    expect(detected).toEqual([])
  })

  it('fires only into the gap — nothing declared, nothing at the root', () => {
    const detected = autoDetectProjects('/repo', 'src', undefined, {
      hasComponents: () => false,
      detect: () => [{ name: 'X', dir: 'x', packageName: 'x' }],
    })
    expect(detected.map((p) => p.name)).toEqual(['X'])
  })
})

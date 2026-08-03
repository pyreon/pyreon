/**
 * Multi-root discovery, end to end over a REAL directory tree.
 *
 * The unit tests around `componentKey` prove the graph keeps two same-named
 * components apart. That is not the same claim as "a monorepo scan finds and
 * keeps both", which needs the config, the fan-out, the project stamp and the
 * graph to agree — and it is the claim a user cares about. So this writes real
 * files and runs the real scan.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runScan, scanRoots } from '../run'
import { componentKey } from '../../core'

let root: string

const write = (relative: string, source: string): void => {
  const path = join(root, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source, 'utf8')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-monorepo-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('scanRoots', () => {
  it('is the single default root when no projects are declared', () => {
    expect(scanRoots({ dir: 'src' }, undefined)).toEqual([{ dir: 'src' }])
  })

  it('omits `dir` entirely when unset, leaving the default to one owner', () => {
    // Restating `'src'` here would be a second place for the default to live,
    // and the two would eventually disagree.
    expect(scanRoots({}, undefined)).toEqual([{}])
  })

  it('fans out over declared projects, and IGNORES --dir', () => {
    expect(
      scanRoots({ dir: 'src' }, [
        { name: 'Core', dir: 'packages/core/src' },
        { name: 'Admin', dir: 'packages/admin/src' },
      ]),
    ).toEqual([
      { dir: 'packages/core/src', project: 'Core' },
      { dir: 'packages/admin/src', project: 'Admin' },
    ])
  })
})

describe('a monorepo scan', () => {
  const button = (label: string) =>
    `export function Button(props: { label: string }) {\n  return null as never // ${label}\n}\n`

  beforeEach(() => {
    write('packages/core/src/Button.tsx', button('core'))
    write('packages/core/src/forms/Field.tsx', 'export function Field(props: { name: string }) {\n  return null as never\n}\n')
    write('packages/admin/src/Button.tsx', button('admin'))
    write(
      'atlas.config.ts',
      `export const projects = [\n` +
        `  { name: 'Core', dir: 'packages/core/src' },\n` +
        `  { name: 'Admin', dir: 'packages/admin/src' },\n` +
        `]\n`,
    )
  })

  it('KEEPS a component from each package that shares a name', async () => {
    // The headline. Before multi-root identity this returned 2 components, not
    // 3 — one `Button` silently replaced the other.
    const scan = await runScan({ cwd: root, write: false, mount: false })
    const keys = scan.graph.list().map(componentKey).sort()
    expect(keys).toEqual(['Admin/Button', 'Core/Button', 'Core/Field'])
  })

  it('stamps each component with its owning project', async () => {
    const scan = await runScan({ cwd: root, write: false, mount: false })
    const byKey = new Map(scan.graph.list().map((c) => [componentKey(c), c]))
    expect(byKey.get('Core/Button')?.project).toBe('Core')
    expect(byKey.get('Admin/Button')?.project).toBe('Admin')
    // The real name is untouched — it is what an agent imports.
    expect(byKey.get('Admin/Button')?.name).toBe('Button')
  })

  it('gives the two Buttons DISTINCT scenario ids', async () => {
    // Scenario ids are built from the component identifier. Keyed by name they
    // collide in the catalog file, in the verify verdicts, and in the snapshot
    // filenames — three silent overwrites from one shared name.
    const scan = await runScan({ cwd: root, write: false, mount: false })
    const ids = scan.graph.scenarios().map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.some((id) => id.startsWith('core-button'))).toBe(true)
    expect(ids.some((id) => id.startsWith('admin-button'))).toBe(true)
  })

  it('reports the declared projects back, for grouping', async () => {
    const scan = await runScan({ cwd: root, write: false, mount: false })
    expect(scan.projects?.map((p) => p.name)).toEqual(['Core', 'Admin'])
  })
})

describe('a single-package scan is unchanged', () => {
  beforeEach(() => {
    write('src/Button.tsx', 'export function Button(props: { label: string }) {\n  return null as never\n}\n')
  })

  it('sets no project, so every key stays bare', async () => {
    const scan = await runScan({ cwd: root, write: false, mount: false })
    const [only] = scan.graph.list()
    expect(only?.project).toBeUndefined()
    expect(componentKey(only!)).toBe('Button')
    expect(scan.graph.get('Button')).toBeDefined()
  })
})

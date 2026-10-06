/**
 * #3823 — the same project scanned through a cwd-RELATIVE root (`atlas scan`)
 * and an ABSOLUTE one (the dev server the browser runner boots) must derive
 * byte-identical scenario identities, wherever the checkout lives.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { componentKey, qualifyIdentities, scenarioId } from '../../core'
import { discoverComponents } from '../discover'

const roots: string[] = []
function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-sid-'))
  roots.push(dir)
  mkdirSync(join(dir, 'src', 'one'), { recursive: true })
  mkdirSync(join(dir, 'src', 'two'), { recursive: true })
  mkdirSync(join(dir, 'src', 'icons'), { recursive: true })
  const glyph = (t: string) => `export default function Glyph(props: { tone?: string }) { return null /* ${t} */ }`
  writeFileSync(join(dir, 'src', 'one', 'Glyph.tsx'), glyph('one'))
  writeFileSync(join(dir, 'src', 'two', 'Glyph.tsx'), glyph('two'))
  // Same directory, same exported name, different files.
  writeFileSync(join(dir, 'src', 'icons', 'a.tsx'), `export function Mark(props: { x?: string }) { return null }`)
  writeFileSync(join(dir, 'src', 'icons', 'b.tsx'), `export function Mark(props: { x?: string }) { return null }`)
  return dir
}

const ids = (cwd: string, project?: string) =>
  qualifyIdentities(discoverComponents({ cwd, ...(project ? { project } : {}) }))
    .map((c) => scenarioId(componentKey(c), 'Default'))
    .sort()

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

describe('scenario ids are independent of how the scan was invoked', () => {
  it('relative cwd and absolute cwd agree, and carry no path prefix', () => {
    const dir = project()
    const abs = ids(dir, 'Example')
    const rel = ids(relative(process.cwd(), dir), 'Example')
    expect(rel).toEqual(abs)
    expect(abs).toEqual([
      'example-glyph-one--default',
      'example-glyph-two--default',
      'example-mark-a--default',
      'example-mark-b--default',
    ])
  })

  it('two checkouts at different absolute locations agree', () => {
    expect(ids(project())).toEqual(ids(project()))
  })

  it('scanPath is scan-root-relative and POSIX', () => {
    const found = discoverComponents({ cwd: project() })
    expect(found.map((c) => c.scanPath).sort()).toEqual(['icons/a.tsx', 'icons/b.tsx', 'one/Glyph.tsx', 'two/Glyph.tsx'])
  })
})

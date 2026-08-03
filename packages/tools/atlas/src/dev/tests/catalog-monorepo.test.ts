/**
 * The catalog module for a MONOREPO — identity, ids and grouping.
 *
 * Every assertion here has a single-package twin asserting the output is
 * UNCHANGED. That pairing is the point: multi-root support is a widening, not a
 * migration, and a project that ships one package must not see its sidebar,
 * URLs or test ids move because the feature exists.
 */
import { describe, expect, it } from 'vitest'
import type { ComponentIntelligence } from '../../core'
import type { CatalogEntrySource } from '../catalog-module'
import { generateCatalogModule } from '../catalog-module'

const entry = (name: string, file: string, project?: string): CatalogEntrySource => ({
  component: {
    name,
    controls: [],
    axes: [],
    scenarios: [],
    tags: [],
    source: file,
    ...(project !== undefined ? { project } : {}),
  } satisfies ComponentIntelligence,
  file,
})

const PROJECTS = [
  { name: 'Core', dir: '/repo/packages/core/src' },
  { name: 'Admin', dir: '/repo/packages/admin/src' },
]

const monorepo = [
  entry('Button', '/repo/packages/core/src/Button.tsx', 'Core'),
  entry('Field', '/repo/packages/core/src/forms/Field.tsx', 'Core'),
  entry('Button', '/repo/packages/admin/src/Button.tsx', 'Admin'),
]

describe('identity', () => {
  it('emits the KEY alongside the real name for each package', () => {
    const code = generateCatalogModule(monorepo, { root: '/repo', projects: PROJECTS })
    expect(code).toContain('key: "Core/Button"')
    expect(code).toContain('key: "Admin/Button"')
    // The real, importable name survives on both.
    expect(code.match(/name: "Button"/g)).toHaveLength(2)
  })

  it('emits NO key outside a monorepo — the single-package catalog is unchanged', () => {
    const code = generateCatalogModule([entry('Button', '/repo/src/Button.tsx')], { root: '/repo' })
    expect(code).not.toContain('key:')
    expect(code).toContain('name: "Button"')
  })
})

describe('ids', () => {
  it('derives from the key, so both are stable and readable', () => {
    // Not `button` + `button-2`: which one takes the suffix would depend on
    // discovery order, so an unrelated new file could repoint a URL or a
    // `data-testid` at the other package's component.
    const code = generateCatalogModule(monorepo, { root: '/repo', projects: PROJECTS })
    expect(code).toContain('id: "core-button"')
    expect(code).toContain('id: "admin-button"')
  })

  it('is the plain slug outside a monorepo', () => {
    const code = generateCatalogModule([entry('Button', '/repo/src/Button.tsx')], { root: '/repo' })
    expect(code).toContain('id: "button"')
  })
})

describe('grouping', () => {
  it('leads with the PROJECT, then the path within that project', () => {
    // Each package has its own root, so a shared scan root cannot express this:
    // deriving from `/repo` would read `Packages/Core/Src/Forms`.
    const code = generateCatalogModule(monorepo, { root: '/repo', projects: PROJECTS })
    expect(code).toContain('group: "Core/Forms"')
  })

  it('files a component at a project root under the project alone', () => {
    // Not `Core/Components` — that is a directory that does not exist.
    const code = generateCatalogModule(monorepo, { root: '/repo', projects: PROJECTS })
    expect(code).toContain('group: "Core"')
    expect(code).toContain('group: "Admin"')
  })

  it('still honours an explicit pages.group override', () => {
    const code = generateCatalogModule(monorepo, {
      root: '/repo',
      projects: PROJECTS,
      pages: { Field: { group: 'Inputs' } },
    })
    expect(code).toContain('group: "Inputs"')
  })
})

describe('pages overrides in a monorepo', () => {
  it('targets ONE package when keyed by identity', () => {
    const code = generateCatalogModule(monorepo, {
      root: '/repo',
      projects: PROJECTS,
      pages: { 'Admin/Button': { title: 'Admin Button' } },
    })
    expect(code).toContain('title: "Admin Button"')
    // Exactly one — a key-scoped override must not leak onto the other package's
    // same-named component.
    expect(code.match(/title: "Admin Button"/g)).toHaveLength(1)
  })

  it('applies to BOTH when keyed by a bare shared name', () => {
    // Deliberate, and the reason the key form exists: a bare name is a name,
    // and in a monorepo two components genuinely have it.
    const code = generateCatalogModule(monorepo, {
      root: '/repo',
      projects: PROJECTS,
      pages: { Button: { title: 'Any Button' } },
    })
    expect(code.match(/title: "Any Button"/g)).toHaveLength(2)
  })

  it('lets the identity key win over a bare-name entry', () => {
    const code = generateCatalogModule(monorepo, {
      root: '/repo',
      projects: PROJECTS,
      pages: { Button: { title: 'Generic' }, 'Core/Button': { title: 'Core Only' } },
    })
    expect(code).toContain('title: "Core Only"')
    expect(code.match(/title: "Generic"/g)).toHaveLength(1) // only Admin's
  })

  it('falls back to the shared root when a project has no declared dir', () => {
    // Defensive: a stamped component whose project is missing from `projects`
    // must still land somewhere sensible rather than crash the generator.
    const code = generateCatalogModule([entry('Button', '/repo/x/Button.tsx', 'Ghost')], {
      root: '/repo',
    })
    expect(code).toContain('group: "Ghost/X"')
  })
})

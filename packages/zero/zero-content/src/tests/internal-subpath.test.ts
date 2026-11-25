/**
 * `_`-prefixed exports are internal (no semver promise — see "What counts as
 * public API" on the stability page). They live on
 * `@pyreon/zero-content/internal` (client-safe) and
 * `@pyreon/zero-content/internal-server` (Node-only), never on a public entry.
 *
 *   1. no public entry in `package.json#exports` has a `_`-prefixed runtime
 *      export;
 *   2. the generated `virtual:zero-content/collections` module imports its
 *      registry helper from `./internal`, and that name resolves there.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderVirtualCollections } from '../virtual-collections'

const PKG_DIR = join(import.meta.dirname, '..', '..')
const INTERNAL_KEYS = new Set(['./internal', './internal-server'])

interface ExportConditions {
  bun?: string
}

const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as {
  exports: Record<string, ExportConditions | string>
}

const publicEntries = Object.entries(pkg.exports).filter(
  (entry): entry is [string, ExportConditions & { bun: string }] =>
    !INTERNAL_KEYS.has(entry[0]) && typeof entry[1] === 'object' && typeof entry[1].bun === 'string',
)

describe('@pyreon/zero-content internal subpaths', () => {
  it.each(publicEntries)('public entry %s exports no _-prefixed name', async (_key, conds) => {
    const mod = (await import(join(PKG_DIR, conds.bun))) as Record<string, unknown>
    expect(Object.keys(mod).filter((name) => name.startsWith('_'))).toEqual([])
  })

  // Non-underscore internals (test seams) moved off the public entries in the
  // 1.0 API freeze. Each must resolve on its internal subpath and on no
  // public entry.
  const MOVED: Record<'./internal' | './internal-server', readonly string[]> = {
    './internal': [
      'buildBreadcrumbs',
      'buildSrcdoc',
      'deriveApiId',
      'filterHeadings',
      'groupEntries',
      'groupsFromConfig',
      'humanize',
      'normalizeBlogFrontmatter',
      'pageFromParam',
      'renderInstallRows',
      'resolveBlogConfig',
      'validateBlogFrontmatter',
    ],
    './internal-server': [
      'buildPageSearchEntry',
      'collectUnpublishedFiles',
      'collectionSlugFor',
      'emitSeoOutputs',
      'findCollectionForFileImpl',
      'hasMarkdownInContentDir',
      'isBrandedComponentsRegistry',
      'isMarkdownId',
      'isRelativePath',
      'joinUrl',
      'makeInternalLinkResolver',
      'reportPath',
      'resolvePublishNow',
      'selectPublishedEntries',
    ],
  }
  const allMoved = new Set([...MOVED['./internal'], ...MOVED['./internal-server']])

  it.each(publicEntries)('public entry %s exports none of the moved internals', async (_key, conds) => {
    const mod = (await import(join(PKG_DIR, conds.bun))) as Record<string, unknown>
    expect(Object.keys(mod).filter((name) => allMoved.has(name))).toEqual([])
  })

  it.each(Object.entries(MOVED))('%s exports its moved internals', async (key, names) => {
    const mod = (await import(key === './internal' ? '../internal' : '../internal-server')) as Record<string, unknown>
    expect(names.filter((name) => mod[name] === undefined)).toEqual([])
  })

  it('the generated collections module imports _setRegistry from ./internal', async () => {
    const code = renderVirtualCollections({ config: { collections: {} }, root: '/abs/project' })
    expect(code).toContain("import { _setRegistry } from '@pyreon/zero-content/internal'")
    const internal = (await import('../internal')) as Record<string, unknown>
    expect(typeof internal._setRegistry).toBe('function')
  })

  it('the Node-only test resets live on ./internal-server', async () => {
    const server = (await import('../internal-server')) as Record<string, unknown>
    expect(typeof server._resetCompileCacheForTesting).toBe('function')
    expect(typeof server._setResolvedRootForPaths).toBe('function')
  })
})

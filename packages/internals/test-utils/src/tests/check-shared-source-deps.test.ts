// `check-shared-source-deps` — the gate that keeps a TRI-TARGET shared source
// buildable for the WEB target, not just the two native ones.
//
// The bug it exists for: PMTC compiles the shared source and never reads
// node_modules, so both native builds stay green when a new `@pyreon/*` import
// lands. The web build BUNDLES the same file, so an undeclared import breaks
// it — and the only thing that noticed was a Playwright job ~50 minutes into
// CI, reporting a blank page rather than a missing dependency.
//
// The pure logic is tested here; the gate itself was bisect-verified against
// the live breakage (it failed naming @pyreon/elements + @pyreon/coolgrid,
// passed once they were declared).

import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pyreonImports, sharedSourceOf } from '../../../../../scripts/check-shared-source-deps'

describe('pyreonImports', () => {
  it('collects static imports, side-effect imports, and re-exports', () => {
    const src = [
      `import { Stack } from '@pyreon/primitives'`,
      `import '@pyreon/styler'`,
      `export { x } from '@pyreon/core'`,
      `import type { T } from '@pyreon/reactivity'`,
    ].join('\n')
    expect(pyreonImports(src)).toEqual([
      '@pyreon/core',
      '@pyreon/primitives',
      '@pyreon/reactivity',
      '@pyreon/styler',
    ])
  })

  it('ignores non-pyreon and relative specifiers', () => {
    const src = `import a from 'react'\nimport b from './local'\nimport c from '@pyreon/form'`
    expect(pyreonImports(src)).toEqual(['@pyreon/form'])
  })

  it('deduplicates a package imported twice', () => {
    const src = `import { A } from '@pyreon/core'\nimport { B } from '@pyreon/core'`
    expect(pyreonImports(src)).toEqual(['@pyreon/core'])
  })
})

describe('sharedSourceOf', () => {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-shared-src-'))

  it('resolves an entry that imports a sibling example source', () => {
    const webSrc = join(root, 'demo-web', 'src')
    const iosSrc = join(root, 'demo-ios', 'src')
    mkdirSync(webSrc, { recursive: true })
    mkdirSync(iosSrc, { recursive: true })
    writeFileSync(join(iosSrc, 'App.tsx'), 'export const App = () => null\n')
    writeFileSync(
      join(webSrc, 'entry-client.tsx'),
      `import { App } from '../../demo-ios/src/App'\n`,
    )
    expect(sharedSourceOf(join(webSrc, 'entry-client.tsx'))).toBe(
      join(iosSrc, 'App.tsx'),
    )
  })

  it('returns null for an entry with no escaping import (a web-only example)', () => {
    const only = join(root, 'plain-web', 'src')
    mkdirSync(only, { recursive: true })
    writeFileSync(join(only, 'entry-client.tsx'), `import { x } from './local'\n`)
    expect(sharedSourceOf(join(only, 'entry-client.tsx'))).toBeNull()
  })

  it('returns null when the referenced source does not exist', () => {
    const web = join(root, 'dangling-web', 'src')
    mkdirSync(web, { recursive: true })
    writeFileSync(
      join(web, 'entry-client.tsx'),
      `import { App } from '../../nope/src/Missing'\n`,
    )
    expect(sharedSourceOf(join(web, 'entry-client.tsx'))).toBeNull()
  })
})

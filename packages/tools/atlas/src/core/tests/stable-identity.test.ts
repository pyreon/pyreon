/**
 * Identity must not depend on WHERE the project is checked out or HOW the scan
 * was invoked (#3823): the Node scan saw `src/one/Glyph.tsx` (cwd-relative)
 * while the browser run's dev server saw an absolute path, so the same two
 * same-named components got different qualifiers and scenario ids and no
 * browser verdict could merge.
 */
import { describe, expect, it } from 'vitest'
import type { ComponentIntelligence } from '../types'
import { componentKey, identityPath, scanRelativePath } from '../identity'
import { qualifyIdentities } from '../graph'
import { duplicateScenarioIds, scenarioId } from '../scenario'

const c = (name: string, extra: Partial<ComponentIntelligence>): ComponentIntelligence =>
  ({ name, props: [], controls: [], scenarios: [], ...extra }) as ComponentIntelligence

describe('scanRelativePath', () => {
  it('is independent of the root form: relative, absolute, moved checkout, Windows', () => {
    const forms = [
      ['src', 'src/one/Glyph.tsx'],
      ['./src', 'src/one/Glyph.tsx'],
      ['/home/ci/work/app/src', '/home/ci/work/app/src/one/Glyph.tsx'],
      ['/Users/me/dev/other/place/src', '/Users/me/dev/other/place/src/one/Glyph.tsx'],
      ['C:\\repo\\app\\src', 'C:\\repo\\app\\src\\one\\Glyph.tsx'],
      ['C:\\repo\\app/src', 'C:\\repo\\app\\src/one\\Glyph.tsx'],
      ['.', 'one/Glyph.tsx'],
    ] as const
    for (const [root, file] of forms) {
      expect(scanRelativePath(root, file), `${root} + ${file}`).toBe('one/Glyph.tsx')
    }
  })

  it('does not strip a root that is only a string-prefix of a sibling directory', () => {
    expect(scanRelativePath('/a/src', '/a/src-extra/X.tsx')).toBe('/a/src-extra/X.tsx')
  })
})

describe('identityPath', () => {
  it('prefers scanPath over source, and normalises a bare Windows source', () => {
    expect(identityPath({ scanPath: 'one/G.tsx', source: '/abs/src/one/G.tsx' })).toBe('one/G.tsx')
    expect(identityPath({ source: 'src\\one\\G.tsx' })).toBe('src/one/G.tsx')
    expect(identityPath({})).toBeUndefined()
  })
})

describe('qualifyIdentities — stable across surfaces', () => {
  const pair = (source: (dir: string) => string) =>
    qualifyIdentities([
      c('Glyph', { project: 'Example', scanPath: 'one/Glyph.tsx', source: source('one') }),
      c('Glyph', { project: 'Example', scanPath: 'two/Glyph.tsx', source: source('two') }),
    ]).map((x) => scenarioId(componentKey(x), 'Default'))

  it('relative, absolute and moved-checkout sources yield identical scenario ids', () => {
    const rel = pair((d) => `src/${d}/Glyph.tsx`)
    expect(rel).toEqual(['example-glyph-one--default', 'example-glyph-two--default'])
    expect(pair((d) => `/Users/a/dev/app/src/${d}/Glyph.tsx`)).toEqual(rel)
    expect(pair((d) => `/home/runner/other/checkout/src/${d}/Glyph.tsx`)).toEqual(rel)
    expect(pair((d) => `C:\\work\\app\\src\\${d}\\Glyph.tsx`)).toEqual(rel)
  })

  it('without a scanPath, Windows separators still give the POSIX qualifier', () => {
    const out = qualifyIdentities([c('G', { source: 'src\\a\\G.tsx' }), c('G', { source: 'src\\b\\G.tsx' })])
    expect(out.map((x) => x.pathQualifier)).toEqual(['src/a', 'src/b'])
  })

  it('same name, same directory, different files falls back to the file stem', () => {
    const out = qualifyIdentities([
      c('Glyph', { scanPath: 'icons/a.tsx', source: '/x/icons/a.tsx' }),
      c('Glyph', { scanPath: 'icons/b.tsx', source: '/x/icons/b.tsx' }),
    ])
    expect(out.map((x) => x.pathQualifier)).toEqual(['a', 'b'])
  })
})

describe('duplicateScenarioIds', () => {
  const comp = (name: string, ids: string[]) => ({ name, scenarios: ids.map((id) => ({ id })) })
  it('reports an id owned by two components (or twice by one)', () => {
    const dup = duplicateScenarioIds([comp('A', ['a--x', 'shared']), comp('B', ['shared']), comp('C', ['c--y', 'c--y'])])
    expect([...dup]).toEqual([
      ['shared', ['A', 'B']],
      ['c--y', ['C', 'C']],
    ])
  })
  it('is empty for a unique catalog', () => {
    expect(duplicateScenarioIds([comp('A', ['a'])]).size).toBe(0)
  })
})

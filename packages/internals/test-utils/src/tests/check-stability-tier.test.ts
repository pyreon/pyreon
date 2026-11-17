// The package stability-tier gate (1.0 semver contract) — unit coverage for
// each policy function, plus the REAL-REPO invariant the gate exists to hold.
//
// Policy functions are called DIRECTLY (no subprocess fork — see
// .agents/rules/anti-patterns.md "Subprocess testing as a default").

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEPRECATED_ALLOWLIST,
  dependencyFailures,
  deprecatedFailures,
  findDeprecatedTags,
  metaFailures,
  readmeFailures,
  readStabilityField,
  renderStatusLine,
  runGate,
  type PublishedPackage,
  type StabilityField,
  writeStatusLine,
} from '../../../../../scripts/check-stability-tier'

const REPO = resolve(__dirname, '../../../../..')

const pkg = (name: string, extra: Partial<PublishedPackage['pkg']> = {}, dir = '/nowhere'): PublishedPackage => ({
  name,
  dir,
  pkg: { name, ...extra },
})

describe('readStabilityField', () => {
  it('rejects a package with no tier', () => {
    expect(readStabilityField(pkg('@pyreon/x'))).toMatch(/has no `"pyreon": \{ "stability"/)
  })

  it('rejects an experimental subpath that is not an export key', () => {
    const p = pkg('@pyreon/x', {
      exports: { '.': {}, './plain': {} },
      pyreon: { stability: 'stable', experimentalSubpaths: ['./plain', './nope'] },
    })
    expect(readStabilityField(p)).toMatch(/\.\/nope, which is not an export key/)
  })

  it('rejects experimentalSubpaths on an experimental package', () => {
    const p = pkg('@pyreon/x', { exports: { './a': {} }, pyreon: { stability: 'experimental', experimentalSubpaths: ['./a'] } })
    expect(readStabilityField(p)).toMatch(/only meaningful on a stable package/)
  })

  it('accepts a well-formed field', () => {
    const p = pkg('@pyreon/x', { exports: { './plain': {} }, pyreon: { stability: 'stable', experimentalSubpaths: ['./plain'] } })
    expect(readStabilityField(p)).toEqual({ stability: 'stable', experimentalSubpaths: ['./plain'] })
  })
})

describe('README status line', () => {
  const stable: StabilityField = { stability: 'stable', experimentalSubpaths: ['./plain'] }
  const readme = (status: string) => `# @pyreon/x\n\n${status}\n\nBody.\n`

  it('passes the generated line', () => {
    expect(readmeFailures('@pyreon/x', readme(renderStatusLine(stable)), stable)).toEqual([])
  })

  it('fails a missing line', () => {
    expect(readmeFailures('@pyreon/x', '# @pyreon/x\n\nBody.\n', stable)[0]).toMatch(/no status line/)
  })

  it('fails a line that disagrees with the tier', () => {
    const wrong = renderStatusLine({ stability: 'experimental' })
    expect(readmeFailures('@pyreon/x', readme(wrong), stable)[0]).toMatch(/disagrees with package.json/)
  })

  it('fails a second, older status claim in the head (the http / loom drift)', () => {
    const text = `# @pyreon/x\n\n${renderStatusLine(stable)}\n\n> **Private / pre-release.** Not published yet.\n`
    expect(readmeFailures('@pyreon/x', text, stable)[0]).toMatch(/second status claim/)
  })

  it('writes the line under the H1, and rewrites it in place', () => {
    const inserted = writeStatusLine('# @pyreon/x\n\nBody.\n', stable)
    expect(inserted).toBe(`# @pyreon/x\n\n${renderStatusLine(stable)}\n\nBody.\n`)
    const rewritten = writeStatusLine(inserted, { stability: 'experimental' })
    expect(rewritten).toBe(`# @pyreon/x\n\n${renderStatusLine({ stability: 'experimental' })}\n\nBody.\n`)
  })
})

describe('dependencyFailures', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const setup = (files: Record<string, string>) => {
    dir = mkdtempSync(join(tmpdir(), 'stability-tier-'))
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(join(dir, rel, '..'), { recursive: true })
      writeFileSync(join(dir, rel), body)
    }
  }
  const fields = new Map<string, StabilityField>([
    ['@pyreon/stable', { stability: 'stable', experimentalSubpaths: ['./webview'] }],
    ['@pyreon/exp', { stability: 'experimental' }],
  ])
  const stablePkg = (extra: Partial<PublishedPackage['pkg']>) =>
    pkg('@pyreon/stable', { exports: { '.': { bun: './src/index.ts' }, './webview': { bun: './src/webview.ts' } }, ...extra }, dir)

  it('fails a required dependency imported from the stable surface', () => {
    setup({ 'src/index.ts': "import { x } from '@pyreon/exp'\n", 'src/webview.ts': '' })
    const out = dependencyFailures([stablePkg({ dependencies: { '@pyreon/exp': '^1' } })], fields, {})
    expect(out[0]).toMatch(/Imported outside the package's experimental subpaths by: src\/index\.ts/)
  })

  it('allows it when only an experimental subpath imports it', () => {
    setup({ 'src/index.ts': '', 'src/webview.ts': "import { WebView } from '@pyreon/exp'\n" })
    expect(dependencyFailures([stablePkg({ dependencies: { '@pyreon/exp': '^1' } })], fields, {})).toEqual([])
  })

  it('fails a required dependency nothing imports', () => {
    setup({ 'src/index.ts': '' })
    expect(dependencyFailures([stablePkg({ dependencies: { '@pyreon/exp': '^1' } })], fields, {})[0]).toMatch(
      /No source file imports it/,
    )
  })

  it('accepts an allowlisted violation, and fails a stale allowlist entry', () => {
    setup({ 'src/index.ts': '' })
    const p = stablePkg({ dependencies: { '@pyreon/exp': '^1' } })
    expect(dependencyFailures([p], fields, { '@pyreon/stable -> @pyreon/exp': 'native discovery' })).toEqual([])
    expect(dependencyFailures([stablePkg({})], fields, { '@pyreon/stable -> @pyreon/exp': 'native discovery' })[0]).toMatch(
      /no longer a violation/,
    )
  })

  it('treats a non-optional peer as required, an optional peer as fine', () => {
    setup({ 'src/index.ts': "import '@pyreon/exp'\n" })
    expect(dependencyFailures([stablePkg({ peerDependencies: { '@pyreon/exp': '^1' } })], fields, {})).toHaveLength(1)
    const optional = stablePkg({
      peerDependencies: { '@pyreon/exp': '^1' },
      peerDependenciesMeta: { '@pyreon/exp': { optional: true } },
    })
    expect(dependencyFailures([optional], fields, {})).toEqual([])
  })
})

describe('metaFailures', () => {
  const fields = new Map<string, StabilityField>([
    ['@pyreon/store', { stability: 'stable' }],
    ['@pyreon/document-primitives', { stability: 'experimental' }],
  ])

  it('passes explicit re-exports of stable packages', () => {
    expect(metaFailures("export { defineStore } from '@pyreon/store'\n", fields)).toEqual([])
  })

  it('fails a re-export of an experimental package', () => {
    expect(metaFailures("export { DocText } from '@pyreon/document-primitives'\n", fields)[0]).toMatch(/Experimental package/)
  })

  it('fails a `_` name and an `export *`', () => {
    expect(metaFailures("export { _reset } from '@pyreon/store'\n", fields)[0]).toMatch(/`_reset`/)
    expect(metaFailures("export * from '@pyreon/store'\n", fields)[0]).toMatch(/list names explicitly/)
  })
})

describe('@deprecated tags', () => {
  const src = [
    'export interface ForProps {',
    '  /** @deprecated Use `by`. */',
    '  key?: never',
    '}',
    '/**',
    ' * Old.',
    ' * @deprecated Use `newThing`.',
    ' */',
    'export function oldThing() {}',
    '/** Mentions `@deprecated` in prose only. */',
    'export const fine = 1',
    "const s = '@deprecated in a string'",
  ].join('\n')

  it('finds each tag with the symbol it annotates, members qualified by their owner', () => {
    const tags = findDeprecatedTags(src, '/r/src/a.ts', '@pyreon/x')
    expect(tags.map((t) => t.symbol)).toEqual(['ForProps.key', 'oldThing'])
    expect(tags[1]?.line).toBe(7)
  })

  const tags = findDeprecatedTags(src, '/r/src/a.ts', '@pyreon/x')

  it('fails a tag with no manifest removeIn and no allowlist entry', () => {
    const out = deprecatedFailures(tags, new Map(), {}, '/r')
    expect(out).toHaveLength(2)
    expect(out[1]).toMatch(/src\/a\.ts:7: `@deprecated` on @pyreon\/x#oldThing has no manifest entry/)
  })

  it('accepts a manifest entry with removeIn (combined names split) and an allowlisted tag', () => {
    const manifest = new Map([['@pyreon/x', [{ names: ['oldThing', 'olderThing'], removeIn: '2.0.0' }]]])
    expect(deprecatedFailures(tags, manifest, { '@pyreon/x#ForProps.key': 'type guard' }, '/r')).toEqual([])
  })

  it('fails a manifest entry without removeIn, and a stale allowlist entry', () => {
    const manifest = new Map([['@pyreon/x', [{ names: ['oldThing'], removeIn: undefined }]]])
    const out = deprecatedFailures(tags, manifest, { '@pyreon/x#ForProps.key': 'guard', '@pyreon/x#gone': 'stale' }, '/r')
    expect(out.some((f) => /#oldThing has no manifest entry/.test(f))).toBe(true)
    expect(out.some((f) => /\['@pyreon\/x#gone'\] matches no `@deprecated` tag/.test(f))).toBe(true)
  })

  it('gives every allowlist entry a reason', () => {
    for (const [key, reason] of Object.entries(DEPRECATED_ALLOWLIST)) {
      expect(reason.trim().length, key).toBeGreaterThan(20)
    }
  })
})

describe('real repo', () => {
  it('holds every rule (the gate is green on this tree)', async () => {
    expect(await runGate(REPO, false)).toEqual([])
  }, 60_000)
})

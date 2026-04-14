import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { regenerateLlmsTxt } from '../../../../../scripts/gen-docs-core'
import { findManifests, formatLineDiff, renderLlmsTxtLine } from '../index'
import type { PackageManifest } from '../types'

// Unit coverage for scripts/gen-docs.ts. Lives in @pyreon/manifest
// because it consumes the PackageManifest type and there's no dedicated
// test harness for scripts/. The integration test (real-manifests.test.ts)
// proves manifests load; this file proves the generator's transforms.

const minimalManifest: PackageManifest = {
  name: '@pyreon/x',
  tagline: 'does things',
  description: 'd',
  category: 'universal',
  features: [],
  api: [],
}

describe('renderLlmsTxtLine', () => {
  it('produces the minimal `- name — tagline` form when no peerDeps / gotchas', () => {
    expect(renderLlmsTxtLine(minimalManifest)).toBe('- @pyreon/x — does things')
  })

  it('appends peerDeps in `(peer: a, b)` form when present', () => {
    expect(
      renderLlmsTxtLine({ ...minimalManifest, peerDeps: ['@pyreon/runtime-dom'] }),
    ).toBe('- @pyreon/x — does things (peer: @pyreon/runtime-dom)')

    expect(
      renderLlmsTxtLine({ ...minimalManifest, peerDeps: ['@pyreon/core', '@pyreon/reactivity'] }),
    ).toBe('- @pyreon/x — does things (peer: @pyreon/core, @pyreon/reactivity)')
  })

  it('appends the FIRST gotcha as a teaser (not all gotchas — that belongs in llms-full)', () => {
    expect(
      renderLlmsTxtLine({
        ...minimalManifest,
        gotchas: ['first thing', 'second thing', 'third thing'],
      }),
    ).toBe('- @pyreon/x — does things. first thing')
  })

  it('combines peerDeps and first gotcha in the documented order', () => {
    expect(
      renderLlmsTxtLine({
        ...minimalManifest,
        peerDeps: ['@pyreon/runtime-dom'],
        gotchas: ['watch out'],
      }),
    ).toBe('- @pyreon/x — does things (peer: @pyreon/runtime-dom). watch out')
  })

  it('handles empty arrays identically to missing fields', () => {
    expect(
      renderLlmsTxtLine({ ...minimalManifest, peerDeps: [], gotchas: [] }),
    ).toBe('- @pyreon/x — does things')
  })
})

describe('regenerateLlmsTxt', () => {
  const baseline = [
    '# llms.txt',
    '',
    '- @pyreon/core — core stuff',
    '- @pyreon/flow — old flow text',
    '- @pyreon/other — other stuff',
    '',
  ].join('\n')

  function wrapped(m: PackageManifest) {
    return [{ path: '/virtual/manifest.ts', manifest: m }]
  }

  it('replaces a matching bullet line in place with the regenerated text', () => {
    const result = regenerateLlmsTxt(
      baseline,
      wrapped({ ...minimalManifest, name: '@pyreon/flow', tagline: 'reactive flow diagrams' }),
    )
    expect(result.missingEntries).toEqual([])
    expect(result.changedLines).toBe(1)
    expect(result.contents).toContain('- @pyreon/flow — reactive flow diagrams')
    expect(result.contents).not.toContain('- @pyreon/flow — old flow text')
    // Other bullets untouched
    expect(result.contents).toContain('- @pyreon/core — core stuff')
    expect(result.contents).toContain('- @pyreon/other — other stuff')
  })

  it('reports manifests whose bullet line cannot be found (hard-error signal)', () => {
    const result = regenerateLlmsTxt(
      baseline,
      wrapped({ ...minimalManifest, name: '@pyreon/nonexistent', tagline: 'no bullet yet' }),
    )
    expect(result.missingEntries).toEqual(['@pyreon/nonexistent'])
    expect(result.changedLines).toBe(0)
    expect(result.contents).toBe(baseline)
  })

  it('is idempotent — second regeneration produces no further changes', () => {
    const manifest: PackageManifest = {
      ...minimalManifest,
      name: '@pyreon/flow',
      tagline: 'reactive flow diagrams',
    }
    const once = regenerateLlmsTxt(baseline, wrapped(manifest))
    const twice = regenerateLlmsTxt(once.contents, wrapped(manifest))
    expect(twice.changedLines).toBe(0)
    expect(twice.contents).toBe(once.contents)
  })

  it('does not match bullet lines for other packages with similar names', () => {
    // Prefix-match safety: `@pyreon/flow` must not match `@pyreon/flow-extra`.
    const content = [
      '- @pyreon/flow — real flow',
      '- @pyreon/flow-extra — a different package',
    ].join('\n')
    const result = regenerateLlmsTxt(
      content,
      wrapped({ ...minimalManifest, name: '@pyreon/flow', tagline: 'updated' }),
    )
    expect(result.contents).toContain('- @pyreon/flow — updated')
    expect(result.contents).toContain('- @pyreon/flow-extra — a different package')
  })
})

describe('findManifests', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'gen-docs-test-'))
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  function writeManifest(category: string, pkg: string, body: string): string {
    const dir = join(tmpRoot, 'packages', category, pkg, 'src')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'manifest.ts')
    writeFileSync(path, body)
    return path
  }

  it('returns an empty array when no packages/ directory exists', async () => {
    const result = await findManifests(tmpRoot)
    expect(result).toEqual([])
  })

  it('discovers a manifest under packages/<category>/<pkg>/manifest.ts', async () => {
    writeManifest(
      'fundamentals',
      'fake',
      `export default {
        name: '@pyreon/fake',
        tagline: 'fake pkg',
        description: 'd',
        category: 'universal' as const,
        features: [],
        api: [],
      }`,
    )
    const result = await findManifests(tmpRoot)
    expect(result).toHaveLength(1)
    expect(result[0]?.manifest.name).toBe('@pyreon/fake')
  })

  it('discovers multiple manifests across different categories', async () => {
    writeManifest(
      'core',
      'a',
      `export default { name: '@pyreon/a', tagline: 't', description: 'd', category: 'universal' as const, features: [], api: [] }`,
    )
    writeManifest(
      'fundamentals',
      'b',
      `export default { name: '@pyreon/b', tagline: 't', description: 'd', category: 'browser' as const, features: [], api: [] }`,
    )
    writeManifest(
      'internals',
      'c',
      `export default { name: '@pyreon/c', tagline: 't', description: 'd', category: 'server' as const, features: [], api: [] }`,
    )
    const result = await findManifests(tmpRoot)
    const names = result.map((r) => r.manifest.name).sort()
    expect(names).toEqual(['@pyreon/a', '@pyreon/b', '@pyreon/c'])
  })

  it('throws when a manifest file has no default export', async () => {
    writeManifest(
      'core',
      'broken',
      `export const manifest = { name: '@pyreon/broken' }`,
    )
    await expect(findManifests(tmpRoot)).rejects.toThrow(/has no default export/)
  })

  it('skips packages without a src/manifest.ts', async () => {
    const dir = join(tmpRoot, 'packages', 'fundamentals', 'no-manifest')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    const result = await findManifests(tmpRoot)
    expect(result).toEqual([])
  })
})

describe('formatLineDiff', () => {
  it('returns empty string when contents are identical', () => {
    expect(formatLineDiff('a\nb\nc', 'a\nb\nc')).toBe('')
  })

  it('marks a changed line with - / + pair', () => {
    expect(formatLineDiff('a\nb\nc', 'a\nX\nc')).toBe('- b\n+ X')
  })

  it('handles added lines (longer after)', () => {
    expect(formatLineDiff('a\nb', 'a\nb\nc')).toBe('+ c')
  })

  it('handles removed lines (shorter after)', () => {
    expect(formatLineDiff('a\nb\nc', 'a\nb')).toBe('- c')
  })

  it('reports multiple changes together', () => {
    expect(formatLineDiff('a\nb\nc\nd', 'a\nX\nc\nY')).toBe('- b\n+ X\n- d\n+ Y')
  })

  it('handles trailing-newline difference without garbage output', () => {
    // `'a\nb'` vs `'a\nb\n'`: the trailing \n splits into [''] at the
    // tail. Expected: one `+ ` line (the empty string added).
    expect(formatLineDiff('a\nb', 'a\nb\n')).toBe('+ ')
  })

  it('handles mid-file insertions via LCS backtrace (not naive index-pair)', () => {
    // Naive index-pair would emit `- b, + X, - c, + b, - d, + c`
    // (pairing every index where strings differ). LCS correctly
    // identifies b and c as common — only X is inserted.
    expect(formatLineDiff('a\nb\nc\nd', 'a\nX\nb\nc\nd')).toBe('+ X')
  })
})

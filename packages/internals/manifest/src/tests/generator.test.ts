import { renderLlmsTxtLine, regenerateLlmsTxt } from '../../../../../scripts/gen-docs'
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

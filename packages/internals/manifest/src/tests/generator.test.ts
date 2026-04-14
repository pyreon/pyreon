import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  regenerateLlmsFullTxt,
  regenerateLlmsTxt,
} from '../../../../../scripts/gen-docs-core'
import {
  findManifests,
  formatLineDiff,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '../index'
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

  it('teases the labeled-gotcha note (not the label itself) for `{label, note}` form', () => {
    // The label is a heading cue for llms-full blockquotes, not for
    // the one-line bullet teaser — we want the content, not "Note" /
    // "Mount once" / etc. showing up in the bullet.
    expect(
      renderLlmsTxtLine({
        ...minimalManifest,
        gotchas: [{ label: 'Mount once', note: 'nodes mount exactly once' }],
      }),
    ).toBe('- @pyreon/x — does things. nodes mount exactly once')
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

describe('renderLlmsFullSection', () => {
  const base: PackageManifest = {
    name: '@pyreon/x',
    tagline: 'does things',
    description: 'd',
    category: 'universal',
    features: [],
    api: [],
  }

  it('emits header, description, and a typescript code block', () => {
    const out = renderLlmsFullSection({
      ...base,
      title: 'X Package',
      longExample: `const x = 1`,
    })
    // description "d" sits between header and code block
    expect(out).toBe('## @pyreon/x — X Package\n\nd\n\n```typescript\nconst x = 1\n```\n')
  })

  it('falls back to tagline when title is unset', () => {
    const out = renderLlmsFullSection({
      ...base,
      longExample: `const x = 1`,
    })
    expect(out.startsWith('## @pyreon/x — does things\n')).toBe(true)
  })

  it('uses tagline as prose fallback when description is empty', () => {
    const out = renderLlmsFullSection({
      ...base,
      description: '',
      longExample: `const x = 1`,
    })
    expect(out).toContain('## @pyreon/x — does things\n\ndoes things\n\n')
  })

  it('synthesizes body from api[].example when longExample is absent', () => {
    const out = renderLlmsFullSection({
      ...base,
      api: [
        {
          name: 'fn1',
          kind: 'function',
          signature: '() => void',
          summary: 's',
          example: `fn1()`,
        },
        {
          name: 'fn2',
          kind: 'function',
          signature: '() => number',
          summary: 's',
          example: `const n = fn2()`,
        },
      ],
    })
    expect(out).toContain('fn1()\n\nconst n = fn2()')
  })

  it('appends peerDeps as a blockquote when present', () => {
    const out = renderLlmsFullSection({
      ...base,
      peerDeps: ['@pyreon/runtime-dom'],
      longExample: `code`,
    })
    expect(out).toContain('> **Peer dep**: @pyreon/runtime-dom')
  })

  it('pluralizes "Peer deps" for multiple entries', () => {
    const out = renderLlmsFullSection({
      ...base,
      peerDeps: ['@pyreon/a', '@pyreon/b'],
      longExample: `code`,
    })
    expect(out).toContain('> **Peer deps**: @pyreon/a, @pyreon/b')
  })

  it('emits one blockquote note per bare-string gotcha with `> **Note**:` prefix', () => {
    const out = renderLlmsFullSection({
      ...base,
      gotchas: ['first gotcha', 'second gotcha'],
      longExample: `code`,
    })
    expect(out).toContain('> **Note**: first gotcha')
    expect(out).toContain('> **Note**: second gotcha')
  })

  it('uses the custom label for `{label, note}` gotchas', () => {
    const out = renderLlmsFullSection({
      ...base,
      gotchas: [
        { label: 'Migration v1→v2', note: 'rename foo → bar' },
        { label: 'JSX generics', note: 'not parameterisable at call site' },
      ],
      longExample: `code`,
    })
    expect(out).toContain('> **Migration v1→v2**: rename foo → bar')
    expect(out).toContain('> **JSX generics**: not parameterisable at call site')
    expect(out).not.toContain('> **Note**:')
  })

  it('mixes bare strings and labeled objects in one gotchas array', () => {
    const out = renderLlmsFullSection({
      ...base,
      gotchas: [
        'first (bare)',
        { label: 'Custom', note: 'second (labeled)' },
        'third (bare)',
      ],
      longExample: `code`,
    })
    expect(out).toContain('> **Note**: first (bare)')
    expect(out).toContain('> **Custom**: second (labeled)')
    expect(out).toContain('> **Note**: third (bare)')
  })

  it('joins peerDeps and gotchas with blockquote separator `>`', () => {
    const out = renderLlmsFullSection({
      ...base,
      peerDeps: ['@pyreon/runtime-dom'],
      gotchas: ['watch out'],
      longExample: `code`,
    })
    expect(out).toContain('> **Peer dep**: @pyreon/runtime-dom\n>\n> **Note**: watch out')
  })

  it('terminates with a single trailing newline', () => {
    const out = renderLlmsFullSection({ ...base, longExample: `code` })
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })
})

describe('regenerateLlmsFullTxt', () => {
  const baseline = [
    '# llms-full.txt',
    '',
    '## @pyreon/a — A',
    '',
    '```typescript',
    'old A body',
    '```',
    '',
    '## @pyreon/flow — Flow Diagrams',
    '',
    '```typescript',
    'old flow body',
    '```',
    '',
    '> **Peer dep**: old',
    '',
    '## @pyreon/z — Z',
    '',
    'end',
    '',
  ].join('\n')

  const flowManifest: PackageManifest = {
    name: '@pyreon/flow',
    title: 'Flow Diagrams',
    tagline: 'Reactive flow diagrams',
    description: 'd',
    category: 'browser',
    peerDeps: ['@pyreon/runtime-dom'],
    features: [],
    api: [],
    longExample: `const flow = createFlow({})`,
  }

  function wrap(m: PackageManifest) {
    return [{ path: '/virtual/manifest.ts', manifest: m }]
  }

  it('replaces the flow section body without touching neighbours', () => {
    const result = regenerateLlmsFullTxt(baseline, wrap(flowManifest))
    expect(result.missingEntries).toEqual([])
    expect(result.changedLines).toBe(1)
    // Flow's new body landed
    expect(result.contents).toContain('const flow = createFlow({})')
    // Old body is gone
    expect(result.contents).not.toContain('old flow body')
    // Neighbours untouched
    expect(result.contents).toContain('old A body')
    expect(result.contents).toContain('## @pyreon/z — Z')
  })

  it('reports manifests whose section cannot be found', () => {
    const result = regenerateLlmsFullTxt(
      baseline,
      wrap({ ...flowManifest, name: '@pyreon/missing' }),
    )
    expect(result.missingEntries).toEqual(['@pyreon/missing'])
    expect(result.contents).toBe(baseline)
  })

  it('is idempotent', () => {
    const once = regenerateLlmsFullTxt(baseline, wrap(flowManifest))
    const twice = regenerateLlmsFullTxt(once.contents, wrap(flowManifest))
    expect(twice.changedLines).toBe(0)
    expect(twice.contents).toBe(once.contents)
  })

  it('does not match sections for other packages with similar names', () => {
    const content = [
      '## @pyreon/flow — Real',
      '',
      'real flow',
      '',
      '## @pyreon/flow-extra — Different',
      '',
      'different',
      '',
    ].join('\n')
    const result = regenerateLlmsFullTxt(content, wrap(flowManifest))
    expect(result.contents).toContain('## @pyreon/flow — Flow Diagrams')
    expect(result.contents).toContain('## @pyreon/flow-extra — Different')
    expect(result.contents).toContain('different')
  })

  it('handles a section that starts at file offset 0 (no preceding newline)', () => {
    // `findSectionRange` has a dedicated path for the case where the
    // section header is the literal first content — no `\n## <name> —`
    // to match on, so it falls through to `content.startsWith(...)`.
    // Previously untested; regression guard for anyone refactoring
    // the section-finder.
    const m: PackageManifest = {
      name: '@pyreon/first',
      title: 'First',
      tagline: 'first pkg',
      description: 'first description',
      category: 'universal',
      features: [],
      api: [],
      longExample: `const first = 1`,
    }
    const content = [
      '## @pyreon/first — First',
      '',
      'old first',
      '',
      '```typescript',
      'old body',
      '```',
      '',
      '## @pyreon/second — Second',
      '',
      'second body untouched',
      '',
    ].join('\n')

    const result = regenerateLlmsFullTxt(content, [{ path: '/first', manifest: m }])
    expect(result.missingEntries).toEqual([])
    expect(result.changedLines).toBe(1)
    expect(result.contents).toContain('## @pyreon/first — First')
    expect(result.contents).toContain('first description')
    expect(result.contents).toContain('const first = 1')
    expect(result.contents).not.toContain('old body')
    // Neighbour section survives — the at-offset-0 path still finds
    // the next header correctly.
    expect(result.contents).toContain('## @pyreon/second — Second')
    expect(result.contents).toContain('second body untouched')
  })

  it('regenerates multiple sections without index-drift between replacements', () => {
    // Two manifests, two sections. Section A's replacement may shrink
    // or grow the file; section B's range must still find its header
    // after A's replacement. Regression guard for the
    // "find-then-splice loop" approach — each iteration recomputes the
    // section range against the MUTATED `next` string, so it stays
    // correct by construction. This test proves that.
    const manifestA: PackageManifest = {
      name: '@pyreon/a',
      title: 'Package A',
      tagline: 'a tagline',
      description: 'a description',
      category: 'universal',
      features: [],
      api: [],
      longExample: `new A body (longer than original)`,
    }
    const manifestB: PackageManifest = {
      name: '@pyreon/b',
      title: 'Package B',
      tagline: 'b tagline',
      description: 'b description',
      category: 'universal',
      features: [],
      api: [],
      longExample: `new B body`,
    }

    const content = [
      '# preamble',
      '',
      '## @pyreon/a — A',
      '',
      'old a prose',
      '',
      '```typescript',
      'short A',
      '```',
      '',
      '## @pyreon/middle — Untouched',
      '',
      'neighbour that must survive',
      '',
      '```typescript',
      'middle body',
      '```',
      '',
      '## @pyreon/b — B',
      '',
      'old b prose',
      '',
      '```typescript',
      'short B',
      '```',
      '',
    ].join('\n')

    const result = regenerateLlmsFullTxt(content, [
      { path: '/a', manifest: manifestA },
      { path: '/b', manifest: manifestB },
    ])
    expect(result.missingEntries).toEqual([])
    expect(result.changedLines).toBe(2)

    // Both sections updated
    expect(result.contents).toContain('new A body (longer than original)')
    expect(result.contents).toContain('new B body')
    // Both old bodies gone
    expect(result.contents).not.toContain('short A')
    expect(result.contents).not.toContain('short B')
    // Middle section survived intact — the critical assertion:
    // section A's replacement changed the file length BEFORE B's
    // range lookup, yet B was still found correctly AND middle's
    // body survived between them.
    expect(result.contents).toContain('## @pyreon/middle — Untouched')
    expect(result.contents).toContain('neighbour that must survive')
    expect(result.contents).toContain('middle body')
    // Section order preserved
    const idxA = result.contents.indexOf('## @pyreon/a —')
    const idxMiddle = result.contents.indexOf('## @pyreon/middle —')
    const idxB = result.contents.indexOf('## @pyreon/b —')
    expect(idxA).toBeLessThan(idxMiddle)
    expect(idxMiddle).toBeLessThan(idxB)
  })
})

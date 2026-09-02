// The cache save/restore key-drift gate.
//
// `hashFiles(...)` is a pure function of its argument list, so a restore key
// built from a different list than the save can never match. There is no error
// and no red check — the restore misses and the fallback rebuild runs.
//
// The drift this was written for: the bootstrap save hashed six patterns and
// the restore hashed four (both tsconfig patterns missing). Measured on run
// 30840261671, FORTY-THREE jobs each rebuilt all 74 packages, ~350s apiece in a
// tight 347-363s band — a 100% miss rate, not flake. That was 228 of the run's
// 401 runner-minutes: 57% of all CI compute rebuilding artifacts that had been
// cached minutes earlier in the same run.
//
// The prior protection was a comment reading "Key MUST match the restore step
// above — keep in sync." Comments do not diff.

import { describe, expect, it } from 'vitest'
import {
  extractCacheSteps,
  extractKeyUses,
  findDuplicateWriters,
  findKeyDrift,
  findOrphanRestores,
} from '../../../../../scripts/check-cache-key-sync'

// ── one artifact ⇒ one prefix ⇒ one writer ──────────────────────────────────
// The inverse of key drift: one PATH under two prefixes. `~/.bun/install/cache`
// was saved by ci.yml as `bun-install-cache-*` AND by two other workflows as
// `bun-*` — 4.8 GB of duplicate tarball stores in a 10 GB budget (2026-09-01),
// evicting the small entries every PR depends on. Three prior "fixes" trimmed
// one writer each and missed a sibling, because nothing read `path:`.

const step = (opts: { kind: 'save' | 'restore' | 'both'; path: string | string[]; key: string; name?: string }) => {
  const action = opts.kind === 'both' ? 'actions/cache' : `actions/cache/${opts.kind}`
  const path = Array.isArray(opts.path)
    ? `          path: |\n${opts.path.map((p) => `            ${p}`).join('\n')}`
    : `          path: ${opts.path}`
  return [
    ...(opts.name ? [`      - name: ${opts.name}`, `        uses: ${action}@sha`] : [`      - uses: ${action}@sha`]),
    '        with:',
    path,
    `          key: ${opts.key}`,
    '          restore-keys: whatever-',
  ].join('\n')
}

describe('extractCacheSteps', () => {
  it('reads kind, scalar path and the literal key prefix', () => {
    const text = step({ kind: 'save', path: '~/.bun/install/cache', key: "bun-install-cache-${{ runner.os }}-${{ hashFiles('bun.lock') }}" })
    expect(extractCacheSteps(text, 'ci.yml')).toEqual([
      { file: 'ci.yml', line: 1, kind: 'save', paths: ['~/.bun/install/cache'], prefix: 'bun-install-cache-' },
    ])
  })
  it('reads a block-scalar path list, sorted, as the artifact identity', () => {
    const text = step({ kind: 'both', path: ['~/.cargo/registry', '~/.cargo/git'], key: 'cargo-registry-${{ x }}' })
    expect(extractCacheSteps(text, 'f')[0]!.paths).toEqual(['~/.cargo/git', '~/.cargo/registry'])
  })
  it('handles `- name:` first, with `uses:` on the next line, and stops at the next step', () => {
    const text = [
      step({ kind: 'restore', path: 'a', key: 'p-${{ x }}', name: 'Restore a' }),
      step({ kind: 'save', path: 'b', key: 'q-${{ x }}', name: 'Save b' }),
    ].join('\n')
    const out = extractCacheSteps(text, 'f')
    expect(out.map((s) => [s.kind, s.paths[0], s.prefix])).toEqual([
      ['restore', 'a', 'p-'],
      ['save', 'b', 'q-'],
    ])
  })
  it('records an empty prefix for a pure-expression key (per-run keys are not a prefix family)', () => {
    const text = step({ kind: 'save', path: 'packages/*/*/lib', key: '${{ env.BOOTSTRAP_KEY }}' })
    expect(extractCacheSteps(text, 'f')[0]!.prefix).toBe('')
  })
})

describe('findDuplicateWriters', () => {
  it('flags one path written under two prefixes and names every site', () => {
    const steps = [
      ...extractCacheSteps(step({ kind: 'save', path: '~/.bun/install/cache', key: 'bun-install-cache-${{ h }}' }), 'ci.yml'),
      ...extractCacheSteps(step({ kind: 'both', path: '~/.bun/install/cache', key: 'bun-${{ h }}' }), 'release.yml'),
    ]
    expect(findDuplicateWriters(steps)).toEqual([
      {
        paths: ['~/.bun/install/cache'],
        writers: [
          { prefix: 'bun-', sites: ['release.yml:1'] },
          { prefix: 'bun-install-cache-', sites: ['ci.yml:1'] },
        ],
      },
    ])
  })
  it('does NOT flag a restore-only site under a second prefix (that is the orphan check)', () => {
    const steps = [
      ...extractCacheSteps(step({ kind: 'save', path: 'x', key: 'a-${{ h }}' }), 'f'),
      ...extractCacheSteps(step({ kind: 'restore', path: 'x', key: 'b-${{ h }}' }), 'g'),
    ]
    expect(findDuplicateWriters(steps)).toEqual([])
  })
  it('does NOT flag one prefix saved from several sites', () => {
    const steps = [
      ...extractCacheSteps(step({ kind: 'save', path: 'x', key: 'a-${{ h }}' }), 'f'),
      ...extractCacheSteps(step({ kind: 'both', path: 'x', key: 'a-${{ h }}' }), 'g'),
    ]
    expect(findDuplicateWriters(steps)).toEqual([])
  })
  it('treats a different path list as a different artifact', () => {
    const steps = [
      ...extractCacheSteps(step({ kind: 'save', path: ['a', 'b'], key: 'p-${{ h }}' }), 'f'),
      ...extractCacheSteps(step({ kind: 'save', path: ['a'], key: 'q-${{ h }}' }), 'g'),
    ]
    expect(findDuplicateWriters(steps)).toEqual([])
  })
  it('ignores pure-expression keys — a per-run key is not a competing writer', () => {
    const steps = [
      ...extractCacheSteps(step({ kind: 'save', path: 'lib', key: 'bootstrap-ubuntu-${{ h }}' }), 'f'),
      ...extractCacheSteps(step({ kind: 'save', path: 'lib', key: '${{ env.BOOTSTRAP_KEY }}' }), 'f'),
    ]
    expect(findDuplicateWriters(steps)).toEqual([])
  })
})

describe('findOrphanRestores', () => {
  it('flags a restore-only prefix that nothing ever saves', () => {
    const steps = [
      ...extractCacheSteps(step({ kind: 'save', path: 'x', key: 'a-${{ h }}' }), 'f'),
      ...extractCacheSteps(step({ kind: 'restore', path: 'x', key: 'zzz-${{ h }}' }), 'g'),
    ]
    expect(findOrphanRestores(steps)).toEqual([{ prefix: 'zzz-', sites: ['g:1'] }])
  })
  it('accepts a restore whose prefix a combined actions/cache step writes', () => {
    const steps = [
      ...extractCacheSteps(step({ kind: 'both', path: 'x', key: 'a-${{ h }}' }), 'f'),
      ...extractCacheSteps(step({ kind: 'restore', path: 'x', key: 'a-${{ h }}' }), 'g'),
    ]
    expect(findOrphanRestores(steps)).toEqual([])
  })
})

const SIX = "'src/**', 'package.json', 'tsconfig.json', 'root.json', 'boot.ts', 'bun.lock'"
const FOUR = "'src/**', 'package.json', 'boot.ts', 'bun.lock'"

const keyLine = (prefix: string, args: string) =>
  `          key: ${prefix}\${{ hashFiles(${args}) }}`

describe('extractKeyUses', () => {
  it('pulls the prefix and the raw argument list', () => {
    const out = extractKeyUses(keyLine('bootstrap-ubuntu-', SIX), 'ci.yml')
    expect(out).toEqual([
      { file: 'ci.yml', prefix: 'bootstrap-ubuntu-', args: SIX, line: 1 },
    ])
  })

  it('finds several keys and records their line numbers', () => {
    const text = [keyLine('a-', SIX), 'unrelated: true', keyLine('b-', FOUR)].join('\n')
    expect(extractKeyUses(text, 'f').map((u) => [u.prefix, u.line])).toEqual([
      ['a-', 1],
      ['b-', 3],
    ])
  })

  it('handles a restore-keys entry with no `key:` label', () => {
    // restore-keys are bare list items, not `key:` mappings — both must parse
    // or the drift hides on exactly the side that caused the outage.
    const out = extractKeyUses(`          bootstrap-ubuntu-\${{ hashFiles(${FOUR}) }}`, 'action.yml')
    expect(out[0]).toMatchObject({ prefix: 'bootstrap-ubuntu-', args: FOUR })
  })

  it('ignores a key with no hashFiles call', () => {
    expect(extractKeyUses('          key: bootstrap-${{ github.run_id }}', 'ci.yml')).toEqual([])
  })

  it('tolerates whitespace inside the interpolation', () => {
    const out = extractKeyUses(`  key: p-\${{   hashFiles(${FOUR})   }}`, 'f')
    expect(out[0]!.args).toBe(FOUR)
  })
})

describe('findKeyDrift', () => {
  const use = (file: string, args: string, prefix = 'bootstrap-ubuntu-', line = 1) => ({
    file,
    prefix,
    args,
    line,
  })

  it('flags one prefix hashing two different lists', () => {
    const out = findKeyDrift([use('ci.yml', SIX), use('action.yml', FOUR)])
    expect(out).toHaveLength(1)
    expect(out[0]!.prefix).toBe('bootstrap-ubuntu-')
    expect(out[0]!.variants).toHaveLength(2)
  })

  it('names every site of each variant, so the fix is unambiguous', () => {
    const out = findKeyDrift([
      use('ci.yml', SIX, 'bootstrap-ubuntu-', 245),
      use('ci.yml', SIX, 'bootstrap-ubuntu-', 274),
      use('action.yml', FOUR, 'bootstrap-ubuntu-', 142),
    ])
    const six = out[0]!.variants.find((v) => v.args === SIX)!
    expect(six.sites).toEqual(['ci.yml:245', 'ci.yml:274'])
  })

  it('does NOT flag a prefix used consistently', () => {
    expect(findKeyDrift([use('ci.yml', SIX), use('action.yml', SIX)])).toEqual([])
  })

  it('does NOT flag a prefix with a single site — it cannot drift', () => {
    expect(findKeyDrift([use('ci.yml', SIX)])).toEqual([])
  })

  it('keeps different prefixes independent', () => {
    // node-modules- and bootstrap- legitimately hash different things.
    const out = findKeyDrift([
      use('a', SIX, 'bootstrap-'),
      use('b', SIX, 'bootstrap-'),
      use('c', FOUR, 'node-modules-'),
      use('d', FOUR, 'node-modules-'),
    ])
    expect(out).toEqual([])
  })

  it('treats a whitespace-only difference as drift', () => {
    // hashFiles digests the resolved file set, but the ARGUMENT TEXT differing
    // is a reliable smell that someone edited one site and not the other; the
    // gate is deliberately strict rather than normalising.
    const out = findKeyDrift([use('a', "'x', 'y'"), use('b', "'x','y'")])
    expect(out).toHaveLength(1)
  })
})

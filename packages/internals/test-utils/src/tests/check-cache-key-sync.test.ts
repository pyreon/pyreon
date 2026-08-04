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
import { extractKeyUses, findKeyDrift } from '../../../../../scripts/check-cache-key-sync'

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

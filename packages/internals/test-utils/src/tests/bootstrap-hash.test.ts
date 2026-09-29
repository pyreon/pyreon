/**
 * `scripts/bootstrap-hash.ts` — the staleness decision behind
 * `scripts/bootstrap.ts`.
 *
 * The regression: the manifest recorded only the SOURCE hash bootstrap last
 * built from. When lib/ was rewritten out-of-band (a manual
 * `bun run --filter=<pkg> build` from a different source revision — the
 * documented dev-server bisect recipe does exactly that) and the source then
 * returned to the recorded content (checkout back / a merge landing on the
 * same bytes), the source hash matched the manifest and bootstrap skipped the
 * package while lib/ held the other build. Observed as `@pyreon/runtime-server`
 * not rebuilding after a merge. The manifest now records the lib/ hash too.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  computeLibHash,
  computePkgHash,
  type ManifestEntry,
  parseManifest,
  serializeManifest,
  staleReason,
} from '../../../../../scripts/bootstrap-hash'

let pkg: string

function write(rel: string, content: string): void {
  const full = join(pkg, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

/** What bootstrap does after a successful build: record both halves. */
function record(salt: string): ManifestEntry {
  return { src: computePkgHash(pkg, salt), lib: computeLibHash(pkg) }
}

/** What bootstrap does at check time. */
function check(entry: ManifestEntry | undefined, salt: string) {
  return staleReason(entry, computePkgHash(pkg, salt), computeLibHash(pkg))
}

beforeEach(() => {
  pkg = mkdtempSync(join(tmpdir(), 'pyreon-bootstrap-hash-'))
  write('package.json', '{"name":"@fake/pkg"}')
})

afterEach(() => {
  rmSync(pkg, { recursive: true, force: true })
})

describe('staleReason — out-of-band lib/ rewrite (the regression)', () => {
  it('a lib/ rebuilt from OTHER source is stale after the source returns to the recorded content', () => {
    // Bootstrap builds revision A and records it.
    write('src/index.ts', 'export const v = "A"')
    write('lib/index.js', 'export const v = "A"')
    const entry = record('salt')
    expect(check(entry, 'salt')).toBe(null)

    // Checkout revision B + a manual per-package build: lib now holds B.
    write('src/index.ts', 'export const v = "B"')
    write('lib/index.js', 'export const v = "B"')

    // Source goes back to A (checkout back / merge landing on A's bytes).
    write('src/index.ts', 'export const v = "A"')

    // Source hash matches the manifest — lib/ does NOT. Must rebuild.
    expect(check(entry, 'salt')).toBe('lib-changed')
  })

  it('detects a rewrite of a non-index lib chunk', () => {
    write('src/index.ts', 'x')
    write('lib/index.js', 'import "./chunk.js"')
    write('lib/analysis/chunk.js', 'one')
    const entry = record('salt')
    write('lib/analysis/chunk.js', 'two')
    expect(check(entry, 'salt')).toBe('lib-changed')
  })

  it('ignores source maps (derived from the .js beside them)', () => {
    write('src/index.ts', 'x')
    write('lib/index.js', 'code')
    write('lib/index.js.map', '{"v":1}')
    const entry = record('salt')
    write('lib/index.js.map', '{"v":2}')
    expect(check(entry, 'salt')).toBe(null)
  })
})

describe('staleReason — source side', () => {
  it('fresh when source and lib both match the recorded build', () => {
    write('src/index.ts', 'x')
    write('lib/index.js', 'x')
    expect(check(record('salt'), 'salt')).toBe(null)
  })

  it('stale when source content changed', () => {
    write('src/index.ts', 'x')
    write('lib/index.js', 'x')
    const entry = record('salt')
    write('src/index.ts', 'y')
    expect(check(entry, 'salt')).toBe('source-changed')
  })

  it('stale when the global salt changed (dep / tooling bump)', () => {
    write('src/index.ts', 'x')
    write('lib/index.js', 'x')
    const entry = record('salt-1')
    expect(check(entry, 'salt-2')).toBe('source-changed')
  })

  it('stale with no manifest entry (first run / never built)', () => {
    write('src/index.ts', 'x')
    expect(check(undefined, 'salt')).toBe('source-changed')
  })

  it('test files do not affect the source hash', () => {
    write('src/index.ts', 'x')
    write('lib/index.js', 'x')
    const entry = record('salt')
    write('src/tests/a.test.ts', 'anything')
    write('src/b.test.tsx', 'anything')
    expect(check(entry, 'salt')).toBe(null)
  })
})

describe('parseManifest', () => {
  it('drops v1 bare-string entries so those packages rebuild once, never skip', () => {
    const m = parseManifest(
      JSON.stringify({ '@a/x': 'deadbeef', '@a/y': { src: 's', lib: 'l' }, '@a/z': { src: 's' } }),
    )
    expect(m).toEqual({ '@a/y': { src: 's', lib: 'l' } })
  })

  it('returns an empty manifest for corrupt JSON', () => {
    expect(parseManifest('{not json')).toEqual({})
    expect(parseManifest('[]')).toEqual({})
  })

  it('round-trips with sorted keys', () => {
    const text = serializeManifest({ b: { src: '1', lib: '2' }, a: { src: '3', lib: '4' } })
    expect(Object.keys(JSON.parse(text))).toEqual(['a', 'b'])
    expect(parseManifest(text)).toEqual({ a: { src: '3', lib: '4' }, b: { src: '1', lib: '2' } })
  })
})

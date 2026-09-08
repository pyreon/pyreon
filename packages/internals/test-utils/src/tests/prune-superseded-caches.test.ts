// The superseded-cache pruner DELETES, so the contract is which uncertainties
// resolve to "keep": only main, only the listed families, only entries with a
// content hash, never the newest of a lineage, never anything younger than
// the grace window.

import { describe, expect, it } from 'vitest'
import {
  type CacheEntry,
  GRACE_MS,
  lineageOf,
  selectSuperseded,
} from '../../../../../scripts/prune-superseded-caches'

const H1 = 'a'.repeat(64)
const H2 = 'b'.repeat(64)
const H3 = 'c'.repeat(64)
const NOW = Date.parse('2026-09-07T12:00:00Z')
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3600e3).toISOString()
const e = (
  id: number,
  key: string,
  createdAt: string,
  ref = 'refs/heads/main',
  sizeInBytes = 1,
): CacheEntry => ({
  id,
  key,
  ref,
  createdAt,
  sizeInBytes,
})

describe('lineageOf', () => {
  it('strips the trailing content hash of a family key', () => {
    expect(lineageOf('bun-install-cache-Linux-' + H1)).toBe('bun-install-cache-Linux')
    expect(lineageOf('node-modules-Linux-bun-' + H1)).toBe('node-modules-Linux-bun')
  })
  it('keeps platforms apart', () => {
    expect(lineageOf('bun-install-cache-macOS-' + H1)).not.toBe(
      lineageOf('bun-install-cache-Linux-' + H1),
    )
  })
  it('returns null for a key outside the families or without a hash', () => {
    expect(lineageOf('native-verdicts-ci-Linux-native-compiler-1-' + H1)).toBeNull()
    expect(lineageOf('bootstrap-34142631901')).toBeNull()
    expect(lineageOf('tsbuildinfo-Linux-1-x')).toBeNull()
  })
})

describe('selectSuperseded', () => {
  it('deletes every generation but the newest of a lineage', () => {
    const sel = selectSuperseded(
      [
        e(1, 'bun-install-cache-Linux-' + H1, at(72)),
        e(2, 'bun-install-cache-Linux-' + H2, at(48)),
        e(3, 'bun-install-cache-Linux-' + H3, at(24)),
      ],
      NOW,
    )
    expect(sel.del.map((x) => x.id).sort()).toEqual([1, 2])
    expect(sel.keep.map((x) => x.id)).toEqual([3])
  })
  it('never touches a PR ref', () => {
    const sel = selectSuperseded(
      [
        e(1, 'node-modules-Linux-bun-' + H1, at(72), 'refs/pull/1/merge'),
        e(2, 'node-modules-Linux-bun-' + H2, at(24), 'refs/pull/1/merge'),
      ],
      NOW,
    )
    expect(sel.del).toEqual([])
  })
  it('never touches a family it does not know, even on main', () => {
    const sel = selectSuperseded(
      [
        e(1, 'native-verdicts-ci-Linux-x-' + H1, at(72)),
        e(2, 'native-verdicts-ci-Linux-x-' + H2, at(24)),
      ],
      NOW,
    )
    expect(sel.del).toEqual([])
  })
  it('keeps a superseded entry that is still inside the grace window', () => {
    const sel = selectSuperseded(
      [
        e(1, 'playwright-chromium-Linux-' + H1, new Date(NOW - GRACE_MS + 60e3).toISOString()),
        e(2, 'playwright-chromium-Linux-' + H2, at(0)),
      ],
      NOW,
    )
    expect(sel.del).toEqual([])
    expect(sel.keep).toHaveLength(2)
  })
  it('keeps the only generation of a lineage', () => {
    const sel = selectSuperseded([e(1, 'cargo-target-Linux-' + H1, at(500))], NOW)
    expect(sel.del).toEqual([])
  })
  it('does not let a newer generation on another platform supersede this one', () => {
    const sel = selectSuperseded(
      [e(1, 'bun-install-cache-Linux-' + H1, at(72)), e(2, 'bun-install-cache-macOS-' + H2, at(1))],
      NOW,
    )
    expect(sel.del).toEqual([])
  })
})

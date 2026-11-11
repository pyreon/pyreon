import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CATALOG_FILE,
  catalogNames,
  emittedNames,
  findDrift,
  scan,
} from '../../../../../scripts/check-counter-catalog'

/**
 * Tests for `scripts/check-counter-catalog.ts`, the static twin of
 * perf-harness's `catalog-drift.test.ts`. It runs in validate-fast so a PR
 * adding a counter fails on ITSELF, not on the next PR whose coverage run
 * happens to include perf-harness (#4236 → `i18n.formatList`).
 */

const CATALOG = [
  '| Counter | Emitted from | Meaning |',
  '| --- | --- | --- |',
  '| `i18n.t` | create-i18n.ts | per t() |',
  '| `runtime.mount` | mount.ts | per mount |',
].join('\n')

describe('emittedNames', () => {
  it('finds direct sink calls in both quote styles', () => {
    const src = `_countSink.__pyreon_count__?.('i18n.t'); g.__pyreon_count__?.("runtime.mount", 2)`
    expect(emittedNames(src)).toEqual(['i18n.t', 'runtime.mount'])
  })

  it('attributes call sites of a function forwarder', () => {
    const src = [
      'function _count(name: string) { (globalThis as any).__pyreon_count__?.(name) }',
      "_count('island.scheduled')",
    ].join('\n')
    expect(emittedNames(src)).toEqual(['island.scheduled'])
  })

  it('attributes call sites of a const-arrow forwarder', () => {
    const src = [
      'const _count: (name: string) => void =',
      "  process.env.NODE_ENV === 'production' ? () => {} : (name) => { _sink.__pyreon_count__?.(name) }",
      "_count('store.patch')",
    ].join('\n')
    expect(emittedNames(src)).toEqual(['store.patch'])
  })

  it('does not treat an ordinary emitter as a forwarder', () => {
    const src = [
      "function track(label: string) { _sink.__pyreon_count__?.('form.track') }",
      "track('not a counter')",
    ].join('\n')
    expect(emittedNames(src)).toEqual(['form.track'])
  })
})

describe('catalogNames', () => {
  it('reads backticked names from table rows only', () => {
    expect([...catalogNames(`${CATALOG}\n\nProse mentioning \`i18n.l\` is not a row.`)]).toEqual([
      'i18n.t',
      'runtime.mount',
    ])
  })
})

describe('findDrift', () => {
  const cataloged = catalogNames(CATALOG)

  it('passes when source and catalog agree', () => {
    const emitted = new Map([
      ['i18n.t', ['a.ts']],
      ['runtime.mount', ['b.ts']],
    ])
    expect(findDrift(emitted, cataloged)).toEqual({ undocumented: [], stale: [] })
  })

  it('fails on a counter in source with no catalog row', () => {
    const emitted = new Map([
      ['i18n.t', ['a.ts']],
      ['runtime.mount', ['b.ts']],
      ['i18n.formatList', ['formatters.ts']],
    ])
    expect(findDrift(emitted, cataloged).undocumented).toEqual([
      ['i18n.formatList', ['formatters.ts']],
    ])
  })

  it('fails on a catalog row that nothing emits', () => {
    const emitted = new Map([['i18n.t', ['a.ts']]])
    expect(findDrift(emitted, cataloged).stale).toEqual(['runtime.mount'])
  })
})

describe('scan (filesystem)', () => {
  let root = ''
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  function fixture(files: Record<string, string>): string {
    root = mkdtempSync(join(tmpdir(), 'counter-catalog-'))
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel)
      mkdirSync(join(abs, '..'), { recursive: true })
      writeFileSync(abs, text)
    }
    return root
  }

  it('scans every package src, skipping tests and build output', () => {
    const dir = fixture({
      [CATALOG_FILE]: CATALOG,
      'packages/core/runtime-dom/src/mount.ts': "s.__pyreon_count__?.('runtime.mount')",
      'packages/fundamentals/i18n/src/t.ts': "s.__pyreon_count__?.('i18n.t')",
      'packages/fundamentals/i18n/src/tests/x.test.ts': "s.__pyreon_count__?.('test.only')",
      'packages/fundamentals/i18n/lib/index.js': "s.__pyreon_count__?.('built.only')",
    })
    expect(scan(dir)).toEqual({ undocumented: [], stale: [] })
  })

  it('catches a counter in a package no list names yet', () => {
    const dir = fixture({
      [CATALOG_FILE]: CATALOG,
      'packages/core/runtime-dom/src/mount.ts': "s.__pyreon_count__?.('runtime.mount')",
      'packages/fundamentals/i18n/src/t.ts': "s.__pyreon_count__?.('i18n.t')",
      'packages/fundamentals/brand-new/src/index.ts': "s.__pyreon_count__?.('brand.new')",
    })
    expect(scan(dir).undocumented.map(([n]) => n)).toEqual(['brand.new'])
  })
})

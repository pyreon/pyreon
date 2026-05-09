/**
 * Counter-emission contract tests.
 *
 * Each of the 6 counters declared in `packages/internals/perf-harness/COUNTERS.md`
 * must fire under a controllable, deterministic input. These tests stub
 * `globalThis.__pyreon_count__` before each case, run a controlled fixture,
 * and assert the exact emission count + name.
 *
 * This file IS the bisect-verification harness for the foundation: if any
 * emit is removed from the i18n source, the corresponding test here fails.
 * Two of the counters (`i18n.lookupKey.fallback` and `i18n.namespaceLoad`)
 * never fire in the recorded `perf-results/` baselines because the journeys
 * intentionally have full coverage / synchronous seeding — those code paths
 * only have coverage HERE.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createI18n } from '../create-i18n'

interface SinkGlobal {
  __pyreon_count__?: (name: string, n?: number) => void
}

let captured: Map<string, number>
let originalSink: SinkGlobal['__pyreon_count__']

beforeEach(() => {
  captured = new Map()
  const g = globalThis as SinkGlobal
  originalSink = g.__pyreon_count__
  g.__pyreon_count__ = (name: string, n: number = 1) => {
    captured.set(name, (captured.get(name) ?? 0) + n)
  }
})

afterEach(() => {
  const g = globalThis as SinkGlobal
  if (originalSink === undefined) {
    delete g.__pyreon_count__
  } else {
    g.__pyreon_count__ = originalSink
  }
})

const counts = (name: string): number => captured.get(name) ?? 0

describe('i18n counters — emission contract', () => {
  describe('i18n.t', () => {
    it('fires exactly once per t() call', () => {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: { hello: 'Hello' } },
      })
      i18n.t('hello')
      expect(counts('i18n.t')).toBe(1)
      i18n.t('hello')
      i18n.t('hello')
      expect(counts('i18n.t')).toBe(3)
    })
  })

  describe('i18n.lookupKey', () => {
    it('fires per lookupKey() — once per t() in the no-plural / no-fallback case', () => {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: { hello: 'Hello' } },
      })
      i18n.t('hello')
      expect(counts('i18n.lookupKey')).toBe(1)
    })

    it('exists() ALSO fires lookupKey (drives the catalog total)', () => {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: { hello: 'Hello' } },
      })
      i18n.exists('hello')
      // exists() may probe both current locale and fallbackLocale; we just
      // assert it fires AT LEAST once. The contract is "lookupKey emits per
      // call", not "exists() emits exactly N times".
      expect(counts('i18n.lookupKey')).toBeGreaterThanOrEqual(1)
    })
  })

  describe('i18n.lookupKey.fallback', () => {
    it('fires when current locale misses AND fallbackLocale is consulted', () => {
      const i18n = createI18n({
        locale: 'cs',
        fallbackLocale: 'en',
        messages: {
          en: { onlyInEn: 'English-only message' },
          // `cs` exists as a locale but does not have `onlyInEn`
          cs: { other: 'Other' },
        },
      })
      i18n.t('onlyInEn')
      expect(counts('i18n.lookupKey.fallback')).toBe(1)
    })

    it('does NOT fire when current locale has the key', () => {
      const i18n = createI18n({
        locale: 'en',
        fallbackLocale: 'en',
        messages: { en: { hello: 'Hello' } },
      })
      i18n.t('hello')
      expect(counts('i18n.lookupKey.fallback')).toBe(0)
    })

    it('does NOT fire when fallbackLocale is not configured', () => {
      const i18n = createI18n({
        locale: 'cs',
        // No fallbackLocale — missing keys return the key as-is
        messages: { cs: { other: 'Other' } },
      })
      i18n.t('missingKey')
      expect(counts('i18n.lookupKey.fallback')).toBe(0)
    })

    it('fires on the plural-suffix path too (not just standard lookup)', () => {
      const i18n = createI18n({
        locale: 'cs',
        fallbackLocale: 'en',
        messages: {
          en: { items_one: '{{count}} item', items_other: '{{count}} items' },
          cs: { other: 'Other' },
        },
      })
      i18n.t('items', { count: 3 })
      // The plural path probes `items_other` in current locale (miss), then
      // fallback (hit). Counter fires on the fallback consultation.
      expect(counts('i18n.lookupKey.fallback')).toBeGreaterThanOrEqual(1)
    })
  })

  describe('i18n.interpolate', () => {
    it('fires once per interpolated t() call', () => {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: { greeting: 'Hello {{name}}' } },
      })
      i18n.t('greeting', { name: 'Ada' })
      expect(counts('i18n.interpolate')).toBe(1)
    })

    it('does NOT fire when values is undefined (fast-path skip)', () => {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: { greeting: 'Hello {{name}}' } },
      })
      i18n.t('greeting')
      expect(counts('i18n.interpolate')).toBe(0)
    })

    it('does NOT fire when template has no `{{` markers (fast-path skip)', () => {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: { plain: 'No interpolation here' } },
      })
      i18n.t('plain', { name: 'Ada' })
      expect(counts('i18n.interpolate')).toBe(0)
    })
  })

  describe('i18n.pluralResolve', () => {
    it('fires once per t() call with a count value', () => {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: { items_one: '{{count}} item', items_other: '{{count}} items' } },
      })
      i18n.t('items', { count: 1 })
      expect(counts('i18n.pluralResolve')).toBe(1)
      i18n.t('items', { count: 5 })
      expect(counts('i18n.pluralResolve')).toBe(2)
    })

    it('does NOT fire when values has no count', () => {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: { greeting: 'Hello {{name}}' } },
      })
      i18n.t('greeting', { name: 'Ada' })
      expect(counts('i18n.pluralResolve')).toBe(0)
    })
  })

  describe('i18n.namespaceLoad', () => {
    it('fires when loadNamespace actually triggers a fetch', async () => {
      const i18n = createI18n({
        locale: 'en',
        loader: async () => ({ greeting: 'Hello' }),
      })
      await i18n.loadNamespace('greetings')
      expect(counts('i18n.namespaceLoad')).toBe(1)
    })

    it('does NOT fire when namespace is already loaded (early return)', async () => {
      const i18n = createI18n({
        locale: 'en',
        loader: async () => ({ greeting: 'Hello' }),
      })
      await i18n.loadNamespace('greetings')
      expect(counts('i18n.namespaceLoad')).toBe(1)
      // Second call to the same namespace short-circuits at `nsMap.has(namespace)`
      await i18n.loadNamespace('greetings')
      expect(counts('i18n.namespaceLoad')).toBe(1)
    })

    it('does NOT fire under concurrent load dedup', async () => {
      let resolveLoader: ((dict: Record<string, string>) => void) | null = null
      const loaderPromise = new Promise<Record<string, string>>((res) => {
        resolveLoader = res
      })
      const i18n = createI18n({
        locale: 'en',
        loader: () => loaderPromise,
      })
      const a = i18n.loadNamespace('greetings')
      const b = i18n.loadNamespace('greetings')
      // Second call must hit `pendingPromises.get(cacheKey)` and skip the
      // counter emit. We assert this BEFORE the loader resolves so the dedup
      // path is exercised cleanly.
      expect(counts('i18n.namespaceLoad')).toBe(1)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      resolveLoader!({ greeting: 'Hello' })
      await Promise.all([a, b])
      // Still 1 — the dedup'd second call did not emit.
      expect(counts('i18n.namespaceLoad')).toBe(1)
    })

    it('does NOT fire when no loader is configured (early return)', async () => {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: {} },
      })
      await i18n.loadNamespace('greetings')
      expect(counts('i18n.namespaceLoad')).toBe(0)
    })
  })

  describe('cross-counter signature on a representative t() call', () => {
    it('a t() call with values + count + interpolation fires t / lookupKey / interpolate / pluralResolve once', () => {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: { items_one: '{{count}} item', items_other: '{{count}} items' } },
      })
      i18n.t('items', { count: 1 })
      expect(counts('i18n.t')).toBe(1)
      expect(counts('i18n.pluralResolve')).toBe(1)
      expect(counts('i18n.interpolate')).toBe(1)
      // lookupKey can fire 1 or 2 times depending on the plural-suffix probe
      // path (matches journey baseline). Just assert ≥ 1.
      expect(counts('i18n.lookupKey')).toBeGreaterThanOrEqual(1)
      // No fallback consultation (current locale = 'en' and the keys exist).
      expect(counts('i18n.lookupKey.fallback')).toBe(0)
      // namespaceLoad is independent of t() and stays zero.
      expect(counts('i18n.namespaceLoad')).toBe(0)
    })
  })
})

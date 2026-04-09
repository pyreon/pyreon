/**
 * Regression tests for the `@pyreon/i18n/core` framework-agnostic entry.
 *
 * Why this exists: a real bug report from a backend consumer found
 * that importing `@pyreon/i18n` (the main entry) crashes on bun
 * runtimes whose tsconfig has no `jsxImportSource` set, because the
 * main entry re-exports the JSX `Trans` component which the bun
 * runtime tries to compile on the fly with whatever JSX runtime
 * the consumer's tsconfig points at (or React if not set).
 *
 * The defensive fixes:
 *   1. `trans.tsx` has a per-file `@jsxImportSource @pyreon/core`
 *      pragma so the main entry compiles correctly even from
 *      non-JSX-aware tsconfigs.
 *   2. `@pyreon/i18n/core` is the recommended backend entry — it
 *      transitively only imports `@pyreon/reactivity` and contains
 *      no JSX. README documents this prominently.
 *
 * These tests lock in both fixes by importing through the `/core`
 * entry exclusively. If anyone removes the `/core` subpath export
 * or accidentally adds a JSX import to one of its transitive
 * dependencies, this file fails to load (because vitest's resolver
 * follows the same paths bun does).
 *
 * Note: this file is intentionally a `.ts` (not `.tsx`) so even the
 * test file itself doesn't drag JSX into its module graph.
 */
import { describe, expect, it } from 'vitest'
// IMPORTANT: import from the /core subpath, not the main entry.
// This is the contract under test.
import {
  createI18n,
  interpolate,
  resolvePluralCategory,
  type I18nInstance,
  type InterpolationValues,
} from '../core'

describe('@pyreon/i18n/core — backend entry', () => {
  it('createI18n is exported and constructs an instance', () => {
    const i18n: I18nInstance = createI18n({
      locale: 'en',
      messages: { en: { greeting: 'Hello, {{name}}!' } },
    })
    expect(i18n).toBeDefined()
    expect(typeof i18n.t).toBe('function')
    expect(typeof i18n.locale).toBe('function')
  })

  it('translation interpolation works through the /core entry', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { greeting: 'Hello, {{name}}!' } },
    })
    expect(i18n.t('greeting', { name: 'World' })).toBe('Hello, World!')
  })

  it('reactive locale switching works through the /core entry', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: {
        en: { greeting: 'Hello' },
        de: { greeting: 'Hallo' },
      },
    })
    expect(i18n.t('greeting')).toBe('Hello')
    i18n.locale.set('de')
    expect(i18n.t('greeting')).toBe('Hallo')
  })

  it('pluralization works through the /core entry', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: {
        en: {
          items_one: '{{count}} item',
          items_other: '{{count}} items',
        },
      },
    })
    expect(i18n.t('items', { count: 1 })).toBe('1 item')
    expect(i18n.t('items', { count: 5 })).toBe('5 items')
  })

  it('interpolate utility is exported and works standalone', () => {
    expect(interpolate('Hello, {{ name }}!', { name: 'World' })).toBe('Hello, World!')
  })

  it('resolvePluralCategory utility is exported and works standalone', () => {
    expect(resolvePluralCategory('en', 1)).toBe('one')
    expect(resolvePluralCategory('en', 5)).toBe('other')
  })

  it('type exports are usable (compile-time check)', () => {
    // This is a runtime-trivial test whose real value is at
    // compile time — if the type exports were removed from /core,
    // this file would fail to typecheck.
    const values: InterpolationValues = { name: 'X', count: 5 }
    expect(values.name).toBe('X')
  })

  it('does NOT export Trans, parseRichText, I18nProvider, or useI18n (those live in main entry)', async () => {
    // The /core entry must stay JSX-free. If anyone adds a JSX
    // re-export to it, this assertion catches it. We dynamic-import
    // the /core module and check its export shape directly.
    const coreModule = (await import('../core')) as Record<string, unknown>
    expect(coreModule.Trans).toBeUndefined()
    expect(coreModule.parseRichText).toBeUndefined()
    expect(coreModule.I18nProvider).toBeUndefined()
    expect(coreModule.useI18n).toBeUndefined()
    expect(coreModule.I18nContext).toBeUndefined()
  })
})

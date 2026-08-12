/**
 * The nested SSR/SSG build must inherit the user's `pyreon()` transform options.
 *
 * `mode: 'ssg' | 'ssr' | 'isr'` runs a nested Vite build over the same source
 * with a FRESH `pyreon()` (the outer instance cannot be reused — its
 * `configResolved` rewrites captured output paths). That call used to take no
 * arguments, so every transform option applied to the client graph and silently
 * did not apply to the SSR graph. `ssrTemplate` was the sharpest case: it shapes
 * only the SSR emit, so the SSR pass is the one place it does anything, and the
 * one place it was dropped.
 *
 * These specs assert the two halves separately, because they fail differently:
 *   - the DISPOSITION is total, so a new option cannot be silently dropped;
 *   - the PICK forwards the transform options and withholds the ones that would
 *     mis-steer the sub-build.
 */
import type { PyreonPluginOptions } from '@pyreon/vite-plugin'
import type { Plugin } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  INNER_PYREON_OPTION_DISPOSITION,
  innerPyreonOptions,
  pickInnerPyreonOptions,
  readOuterPyreonOptions,
} from '../inner-pyreon-options'

/** A plugin array shaped like a resolved config's, with pyreon among others. */
const chain = (pyreonOptions: PyreonPluginOptions | undefined): Plugin[] =>
  [
    { name: 'vite:build-html' },
    pyreonOptions === undefined
      ? { name: 'pyreon' }
      : { name: 'pyreon', api: { pyreonOptions } },
    { name: 'pyreon-zero' },
  ] as Plugin[]

describe('the disposition covers every option', () => {
  it('classifies each key as forward or drop', () => {
    for (const [key, decision] of Object.entries(INNER_PYREON_OPTION_DISPOSITION)) {
      expect(['forward', 'drop'], `${key} has an unknown decision`).toContain(decision)
    }
  })

  it('is TOTAL — the type makes a new option a typecheck error, not a silent drop', () => {
    // The compile-time half is the real guard (`Record<keyof Required<…>>`).
    // This asserts the runtime shape agrees with the interface as it stands, so
    // a key removed from the interface without removing it here is visible too.
    expect(Object.keys(INNER_PYREON_OPTION_DISPOSITION).sort()).toEqual(
      [
        'collapse',
        'compat',
        'compileValidators',
        'devErrorPrinter',
        'islands',
        'jsxAutoImport',
        'lpih',
        'optimizeValidators',
        'ssr',
        'ssrTemplate',
      ].sort(),
    )
  })
})

describe('reading the outer options off the plugin chain', () => {
  it('finds them by plugin name', () => {
    expect(readOuterPyreonOptions(chain({ compat: 'react' }))).toEqual({ compat: 'react' })
  })

  it('returns {} when the plugin predates the api field — old behaviour, not a throw', () => {
    expect(readOuterPyreonOptions(chain(undefined))).toEqual({})
  })

  it('returns {} when pyreon is absent from the chain', () => {
    expect(readOuterPyreonOptions([{ name: 'vite:build-html' }] as Plugin[])).toEqual({})
  })

  it('survives an undefined chain', () => {
    expect(readOuterPyreonOptions(undefined)).toEqual({})
  })

  it('ignores a non-pyreon plugin that happens to expose an api', () => {
    const plugins = [
      { name: 'someone-else', api: { pyreonOptions: { compat: 'vue' } } },
    ] as unknown as Plugin[]
    expect(readOuterPyreonOptions(plugins)).toEqual({})
  })
})

describe('what crosses into the nested build', () => {
  it('forwards ssrTemplate — the option that ONLY affects the SSR graph', () => {
    // The load-bearing assertion. `ssrTemplate: false` used to be a no-op in
    // the exact pass it exists for; @pyreon/loom hit this for real.
    expect(pickInnerPyreonOptions({ ssrTemplate: false })).toEqual({ ssrTemplate: false })
    expect(pickInnerPyreonOptions({ ssrTemplate: true })).toEqual({ ssrTemplate: true })
  })

  it('forwards compat, so aliased imports resolve the same in both graphs', () => {
    expect(pickInnerPyreonOptions({ compat: 'react' })).toEqual({ compat: 'react' })
  })

  it('forwards the remaining source-shaping options', () => {
    const outer: PyreonPluginOptions = {
      islands: false,
      jsxAutoImport: false,
      compileValidators: true,
      optimizeValidators: true,
    }
    expect(pickInnerPyreonOptions(outer)).toEqual(outer)
  })

  it('withholds ssr — it would replace the synthetic entry, not add to it', () => {
    // `config()` returning `build.rollupOptions.input` beats the inline
    // `build({ … })` arg, so forwarding this takes over the sub-build.
    const picked = pickInnerPyreonOptions({ ssr: { entry: './src/entry-server.ts' } })
    expect(picked).not.toHaveProperty('ssr')
    expect(picked).toEqual({})
  })

  it('withholds collapse, lpih and devErrorPrinter', () => {
    const picked = pickInnerPyreonOptions({
      collapse: true,
      lpih: { intervalMs: 500 },
      devErrorPrinter: false,
    })
    expect(Object.keys(picked)).toEqual([])
  })

  it('omits keys the user never set rather than passing explicit undefined', () => {
    // Under exactOptionalPropertyTypes a present-but-undefined key is not the
    // same as an absent one: it would suppress the inner plugin's own default.
    const picked = pickInnerPyreonOptions({ compat: 'react', ssrTemplate: undefined })
    expect('ssrTemplate' in picked).toBe(false)
    expect(picked).toEqual({ compat: 'react' })
  })

  it('passes nothing along when the user configured nothing', () => {
    expect(pickInnerPyreonOptions({})).toEqual({})
  })

  it('end-to-end: chain in, forwarded subset out', () => {
    const picked = innerPyreonOptions(
      chain({
        compat: 'preact',
        ssrTemplate: false,
        ssr: { entry: './src/entry-server.ts' },
        devErrorPrinter: false,
      }),
    )
    expect(picked).toEqual({ compat: 'preact', ssrTemplate: false })
  })
})

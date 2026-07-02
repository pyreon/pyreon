/**
 * Feature-resolution tests. Cover the four-priority resolver in
 * `prompts.ts:resolveFeatures` AND the new --preset / --with-X / --no-X
 * flag parsing in `args.ts`.
 *
 * The interactive branch (priority 4 — preset prompt + grouped
 * multiselect) is NOT tested here; it's only reachable when stdin is a
 * TTY and would require a clack mock. Tests cover the three
 * non-interactive priorities (explicit --features wins, --preset sets a
 * starting point, --yes falls back to template default), plus the
 * --with-X / --no-X composition that overlays every priority.
 */

import { describe, expect, it } from 'vitest'
import { parseArgs } from '../args'
import { resolveFeatures } from '../prompts'
import { PRESETS } from '../templates'

describe('parseArgs — isr mode + typed-routes flags (zero-modes-dx N)', () => {
  it('accepts --mode isr', () => {
    expect(parseArgs(['--mode', 'isr']).mode).toBe('isr')
  })

  it('parses --typed-routes / --no-typed-routes; undefined when absent', () => {
    expect(parseArgs(['--typed-routes']).typedRoutes).toBe(true)
    expect(parseArgs(['--no-typed-routes']).typedRoutes).toBe(false)
    expect(parseArgs([]).typedRoutes).toBeUndefined()
  })

  it('--no-typed-routes is NOT swallowed by the --no-<feature> toggle', () => {
    const args = parseArgs(['--no-typed-routes'])
    expect(args.withoutFeatures.size).toBe(0)
  })
})

describe('parseArgs — feature flags', () => {
  it('parses --preset', () => {
    const args = parseArgs(['--preset', 'standard'])
    expect(args.preset).toBe('standard')
  })

  it('parses --preset=value form', () => {
    const args = parseArgs(['--preset=dashboard'])
    expect(args.preset).toBe('dashboard')
  })

  it('rejects unknown preset', () => {
    expect(() => parseArgs(['--preset', 'gigantic'])).toThrow(/Invalid value "gigantic"/)
  })

  it('parses --with-<feature> as a Set', () => {
    const args = parseArgs(['--with-store', '--with-i18n'])
    expect(args.withFeatures).toEqual(new Set(['store', 'i18n']))
    expect(args.withoutFeatures.size).toBe(0)
  })

  it('parses --no-<feature> as a Set', () => {
    const args = parseArgs(['--no-forms', '--no-table'])
    expect(args.withoutFeatures).toEqual(new Set(['forms', 'table']))
    expect(args.withFeatures.size).toBe(0)
  })

  it('rejects --with-<unknown>', () => {
    expect(() => parseArgs(['--with-frobnicator'])).toThrow(
      /Unknown feature in --with-frobnicator/,
    )
  })

  it('rejects --no-<unknown>', () => {
    expect(() => parseArgs(['--no-widgetize'])).toThrow(/Unknown feature in --no-widgetize/)
  })

  it('treats --no-lint as the lint toggle, not a feature subtraction', () => {
    const args = parseArgs(['--no-lint'])
    expect(args.lint).toBe(false)
    expect(args.withoutFeatures.size).toBe(0)
  })

  it('--lint sets lint=true', () => {
    const args = parseArgs(['--lint'])
    expect(args.lint).toBe(true)
  })
})

describe('resolveFeatures — priority resolution', () => {
  // Helper: build a CliArgs with only the bits relevant to feature
  // resolution; everything else defaulted.
  function args(overrides: {
    features?: string[]
    preset?: keyof typeof PRESETS
    withFeatures?: string[]
    withoutFeatures?: string[]
  }): Parameters<typeof resolveFeatures>[0] {
    return {
      name: undefined,
      yes: false,
      help: false,
      template: undefined,
      adapter: undefined,
      mode: undefined,
      features: overrides.features,
      preset: overrides.preset,
      withFeatures: new Set(overrides.withFeatures ?? []),
      withoutFeatures: new Set(overrides.withoutFeatures ?? []),
      integrations: undefined,
      ai: undefined,
      compat: undefined,
      packageStrategy: undefined,
      lint: undefined,
      typedRoutes: undefined,
    }
  }

  // Priority 1 — explicit --features wins outright.
  it('explicit --features wins, ignores --preset', async () => {
    const out = await resolveFeatures(
      args({ features: ['store'], preset: 'full' }),
      ['query', 'forms'],
      true,
    )
    expect(new Set(out)).toEqual(new Set(['store']))
  })

  it('--features composes with --with-X', async () => {
    const out = await resolveFeatures(
      args({ features: ['store'], withFeatures: ['i18n'] }),
      [],
      true,
    )
    expect(new Set(out)).toEqual(new Set(['store', 'i18n']))
  })

  it('--features composes with --no-X', async () => {
    const out = await resolveFeatures(
      args({ features: ['store', 'query', 'forms'], withoutFeatures: ['forms'] }),
      [],
      true,
    )
    expect(new Set(out)).toEqual(new Set(['store', 'query']))
  })

  // Priority 2 — --preset wins over template default.
  it('--preset minimal yields empty set', async () => {
    const out = await resolveFeatures(args({ preset: 'minimal' }), ['store', 'query'], true)
    expect(out).toEqual([])
  })

  it('--preset standard yields store+query+forms regardless of template default', async () => {
    const out = await resolveFeatures(args({ preset: 'standard' }), [], false)
    expect(new Set(out)).toEqual(new Set(['store', 'query', 'forms']))
  })

  it('--preset + --with-X composes', async () => {
    const out = await resolveFeatures(
      args({ preset: 'standard', withFeatures: ['i18n'] }),
      [],
      true,
    )
    expect(new Set(out)).toEqual(new Set(['store', 'query', 'forms', 'i18n']))
  })

  it('--preset + --no-X composes (subtracts a preset feature)', async () => {
    const out = await resolveFeatures(
      args({ preset: 'standard', withoutFeatures: ['forms'] }),
      [],
      true,
    )
    expect(new Set(out)).toEqual(new Set(['store', 'query']))
  })

  it('--with-X then --no-same-X = subtracted (no-X wins)', async () => {
    const out = await resolveFeatures(
      args({
        preset: 'minimal',
        withFeatures: ['store'],
        withoutFeatures: ['store'],
      }),
      [],
      true,
    )
    expect(out).toEqual([])
  })

  it('--preset full yields every defined feature', async () => {
    const out = await resolveFeatures(args({ preset: 'full' }), [], false)
    expect(new Set(out)).toEqual(new Set(PRESETS.full.features))
    expect(out.length).toBeGreaterThan(15) // sanity check — full is "every feature"
  })

  // Priority 3 — --yes falls back to template default.
  it('--yes uses template default when no --preset/--features', async () => {
    const out = await resolveFeatures(args({}), ['store', 'query'], true)
    expect(new Set(out)).toEqual(new Set(['store', 'query']))
  })

  it('--yes + --with-X composes on template default', async () => {
    const out = await resolveFeatures(args({ withFeatures: ['i18n'] }), ['store'], true)
    expect(new Set(out)).toEqual(new Set(['store', 'i18n']))
  })
})

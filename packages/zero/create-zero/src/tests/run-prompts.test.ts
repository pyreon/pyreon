/**
 * Interactive prompt-flow coverage — the path `--yes` can never reach.
 *
 * The 0.33.0 crash (`Cannot read properties of undefined (reading 'label')`)
 * happened on the INTERACTIVE "Custom — pick features one by one" path, which
 * clack only runs against a real TTY (piped input doesn't drive it). So we mock
 * `@clack/prompts` and drive the real `runPrompts` / `resolveFeatures` end to
 * end — exercising `buildGroupedFeatureOptions` (the exact crash site) without
 * a TTY. A drift between FEATURE_CATEGORIES and FEATURES fails these tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── clack mock: message-routed returns so call ORDER doesn't matter ────────
// Shared mutable state must be `vi.hoisted` because `vi.mock` is hoisted above
// the module body — a plain `const` would be uninitialised inside the factory.
const h = vi.hoisted(() => {
  const selectReturns: Record<string, unknown> = {}
  const multiselectReturns: Record<string, unknown> = {}
  const state = {
    textReturn: 'cz-interactive-test-does-not-exist',
    confirmReturn: true as unknown,
    groupMultiselectReturn: [] as unknown,
    groupMultiselectCalls: [] as Array<{
      options: Record<string, Array<{ value: string; label: string }>>
    }>,
  }
  const routed = (map: Record<string, unknown>, kind: string) =>
    async ({ message }: { message: string }) => {
      for (const [prefix, value] of Object.entries(map)) {
        if (message.startsWith(prefix)) return value
      }
      throw new Error(`unexpected ${kind} prompt: "${message}"`)
    }
  return { selectReturns, multiselectReturns, state, routed }
})

const { selectReturns, multiselectReturns, state } = h

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn(), step: vi.fn(), message: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
  // Nothing in these tests cancels, so isCancel is always false.
  isCancel: () => false,
  text: vi.fn(async () => h.state.textReturn),
  confirm: vi.fn(async () => h.state.confirmReturn),
  select: vi.fn(h.routed(h.selectReturns, 'select')),
  multiselect: vi.fn(h.routed(h.multiselectReturns, 'multiselect')),
  groupMultiselect: vi.fn(
    async (opts: { options: Record<string, Array<{ value: string; label: string }>> }) => {
      h.state.groupMultiselectCalls.push(opts)
      return h.state.groupMultiselectReturn
    },
  ),
}))

import type { CliArgs } from '../args'
import { resolveFeatures, runPrompts } from '../prompts'
import { PRESETS } from '../templates'

function interactiveArgs(over: Partial<CliArgs> = {}): CliArgs {
  return {
    name: undefined,
    yes: false,
    help: false,
    template: undefined,
    adapter: undefined,
    mode: undefined,
    features: undefined,
    preset: undefined,
    withFeatures: new Set<string>(),
    withoutFeatures: new Set<string>(),
    integrations: undefined,
    ai: undefined,
    compat: undefined,
    packageStrategy: undefined,
    lint: undefined,
    typedRoutes: undefined,
    ...over,
  }
}

const MODES = ['ssr-stream', 'ssr-string', 'ssg', 'spa', 'isr']

beforeEach(() => {
  state.groupMultiselectCalls.length = 0
  for (const k of Object.keys(selectReturns)) delete selectReturns[k]
  for (const k of Object.keys(multiselectReturns)) delete multiselectReturns[k]
  state.textReturn = 'cz-interactive-test-does-not-exist'
  state.confirmReturn = true
  state.groupMultiselectReturn = []
})

describe('runPrompts — full interactive flow (the user-facing path)', () => {
  it('drives the "Custom" feature picker end-to-end incl. state-tree + coolgrid (the 0.33.0 crash keys)', async () => {
    Object.assign(selectReturns, {
      Template: 'app',
      'Rendering mode': 'ssg',
      'Deployment target': 'bun',
      'Feature preset': 'custom', // ← the path that crashed
      'Package imports': 'meta',
      'Migrating from': 'none',
    })
    Object.assign(multiselectReturns, {
      'Backend integrations': ['supabase'],
      'AI tooling': ['mcp', 'claude'],
    })
    // The custom multiselect returns features — INCLUDING the two that crashed.
    state.groupMultiselectReturn = ['store', 'state-tree', 'coolgrid', 'query']

    const cfg = await runPrompts(interactiveArgs())

    expect(cfg.template).toBe('app')
    expect(MODES).toContain(cfg.renderMode)
    expect(cfg.adapter).toBeTruthy()
    expect(cfg.features).toEqual(['store', 'state-tree', 'coolgrid', 'query'])
    expect(cfg.packageStrategy).toBe('meta')
    expect(cfg.integrations).toEqual(['supabase'])
    expect(cfg.aiTools).toEqual(['mcp', 'claude'])
    expect(cfg.compat).toBe('none')
    expect(cfg.lint).toBe(true)

    // The grouped options the picker was rendered with must have a DEFINED
    // label for every option — the exact invariant the crash violated.
    expect(state.groupMultiselectCalls).toHaveLength(1)
    const groups = state.groupMultiselectCalls[0]!.options
    for (const options of Object.values(groups)) {
      for (const opt of options) {
        expect(opt.label, `option "${opt.value}" label`).toBeTruthy()
      }
    }
    const allValues = Object.values(groups).flat().map((o) => o.value)
    expect(allValues).toContain('state-tree')
    expect(allValues).toContain('coolgrid')
  })

  it('a non-custom preset selection skips the multiselect and uses the preset features', async () => {
    Object.assign(selectReturns, {
      Template: 'app',
      'Rendering mode': 'ssr-stream',
      'Deployment target': 'vercel',
      'Feature preset': 'standard',
      'Package imports': 'meta',
      'Migrating from': 'none',
    })
    Object.assign(multiselectReturns, {
      'Backend integrations': [],
      'AI tooling': ['mcp'],
    })

    const cfg = await runPrompts(interactiveArgs())

    expect(cfg.features).toEqual([...PRESETS.standard.features])
    expect(state.groupMultiselectCalls).toHaveLength(0) // picker not shown for a preset
  })
})

describe('resolveFeatures — interactive branches in isolation', () => {
  it('custom preset → grouped multiselect result, with --with/--no composed on top', async () => {
    selectReturns['Feature preset'] = 'custom'
    state.groupMultiselectReturn = ['store', 'query']
    const features = await resolveFeatures(
      interactiveArgs({ withFeatures: new Set(['coolgrid']), withoutFeatures: new Set(['query']) }),
      ['store', 'query'],
      false,
    )
    // started [store, query], +coolgrid, -query → [store, coolgrid]
    expect(features.sort()).toEqual(['coolgrid', 'store'])
  })

  it('every preset offered interactively resolves to its declared features', async () => {
    for (const id of Object.keys(PRESETS)) {
      selectReturns['Feature preset'] = id
      const features = await resolveFeatures(interactiveArgs(), [], false)
      expect(features.sort()).toEqual([...PRESETS[id as keyof typeof PRESETS].features].sort())
    }
  })
})

describe('runPrompts — isr mode + typed routes (zero-modes-dx N)', () => {
  it('isr filters the static adapter from the deploy select; typedRoutes confirm lands in config', async () => {
    const p = await import('@clack/prompts')
    ;(p.select as ReturnType<typeof vi.fn>).mockClear()
    Object.assign(selectReturns, {
      Template: 'app',
      'Rendering mode': 'isr',
      'Deployment target': 'node',
      'Feature preset': 'minimal',
      'Package imports': 'meta',
      'Migrating from': 'none',
    })
    Object.assign(multiselectReturns, {
      'Backend integrations': [],
      'AI tooling': [],
    })
    state.confirmReturn = true // lint + typedRoutes confirms
    const cfg = await runPrompts(interactiveArgs())
    expect(cfg.renderMode).toBe('isr')
    expect(cfg.typedRoutes).toBe(true)
    const deployCall = (p.select as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => (c[0] as { message: string }).message === 'Deployment target',
    )
    expect(deployCall).toBeDefined()
    const values = (deployCall![0] as { options: Array<{ value: string }> }).options.map(
      (o) => o.value,
    )
    expect(values).toContain('node')
    expect(values).not.toContain('static')
  })

  it('--no-typed-routes arg skips the prompt and lands false', async () => {
    Object.assign(selectReturns, {
      Template: 'app',
      'Rendering mode': 'ssg',
      'Deployment target': 'static',
      'Feature preset': 'minimal',
      'Package imports': 'meta',
      'Migrating from': 'none',
    })
    Object.assign(multiselectReturns, {
      'Backend integrations': [],
      'AI tooling': [],
    })
    const cfg = await runPrompts(interactiveArgs({ typedRoutes: false }))
    expect(cfg.typedRoutes).toBe(false)
  })
})

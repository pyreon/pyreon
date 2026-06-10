// Tier-2 Strategy-B silent-drop diagnostic warnings.
//
// Closes Gap 4 of the 2026-06-05 native-readiness audit (the "honest
// gate" first PR — same shape as Gap 3's PR-3.1 silent-drop
// diagnostics for walled lifecycle tags, #1441).
//
// The 5 Tier-2 Strategy-B helpers are recognized at the parser layer
// and emit a clear warning naming the offending binding + package +
// Layer-4 workaround. Full Strategy-B runtime ports are multi-PR
// follow-ups; this PR closes the SILENT part of the silent-drop so
// authors aren't blindsided.
//
//   defineStore     → @pyreon/store
//   createMachine   → @pyreon/machine
//   createI18n      → @pyreon/i18n/core
//   model (.create()-chain shape) → @pyreon/state-tree
//   defineFeature   → @pyreon/feature
//   withField       → @pyreon/validate    (Gap 4 Strategy-A follow-up)
//   zodSchema /     → @pyreon/validation  (Gap 4 Strategy-A follow-up)
//   valibotSchema /
//   arktypeSchema
//
// Bisect-verify (per .claude/rules/testing.md):
//   1. Disable the new `tier2StrategyB` block in parse.ts
//   2. Each "warns" spec in this file fails with "expected 1 warning,
//      received 0"
//   3. Restore the block; all specs pass
//
// Reference: docs/src/content/docs/multiplatform-libraries.md → "Tier 2"

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const TIER2_CASES = [
  {
    callee: 'defineStore',
    pkg: '@pyreon/store',
    snippet: `const useCounter = defineStore("counter", () => {
  const count = signal(0)
  return { count }
})`,
    bindingName: 'useCounter',
  },
  // createMachine REMOVED — Gap 4 PR-2 ships the full Strategy-B
  // port for @pyreon/machine, so the silent-drop diagnostic no
  // longer fires for it. The "transform emits NO silent-drop
  // warning for createMachine post-port" spec in
  // tier2-machine-emit-broken.test.ts is the regression lock.
  // createI18n REMOVED — Gap 4 PR-3 ships the full Strategy-B
  // port for @pyreon/i18n/core, so the silent-drop diagnostic no
  // longer fires for it. The "emits NO silent-drop warning for
  // createI18n post-port" spec in tier2-i18n-emit.test.ts is the
  // regression lock.
  // model REMOVED — Gap 4 state-tree v2 follow-up ships full
  // Strategy-B port for @pyreon/state-tree (top-level
  // `const X = model({...}).create()` shape). The silent-drop
  // diagnostic no longer fires for the inline-chain shape because
  // PMTC now emits a real PyreonModel_<id> singleton at module
  // scope + rewrites `X.field` use sites. The two-step shape
  // (`const X = model({...})` alone) still falls through to the
  // tier2StrategyB silent-drop — same incremental promotion
  // pattern createMachine + createI18n followed.
  {
    callee: 'defineFeature',
    pkg: '@pyreon/feature',
    snippet: `const TodoFeature = defineFeature({
  name: "todo",
  schema: { id: "string", title: "string" },
})`,
    bindingName: 'TodoFeature',
  },
  // Gap 4 follow-up — Strategy-A packages (per-validator lowering).
  // Silent-drop diagnostics for @pyreon/validate + @pyreon/validation
  // so authors are not blindsided when their validator-laden code
  // reaches native targets.
  {
    callee: 'withField',
    pkg: '@pyreon/validate',
    snippet: `const emailField = withField(schema, { label: "Email" })`,
    bindingName: 'emailField',
  },
  {
    callee: 'zodSchema',
    pkg: '@pyreon/validation',
    snippet: `const adapter = zodSchema(z.object({ id: z.string() }))`,
    bindingName: 'adapter',
  },
  {
    callee: 'valibotSchema',
    pkg: '@pyreon/validation',
    snippet: `const adapter = valibotSchema(schema, safeParse)`,
    bindingName: 'adapter',
  },
  {
    callee: 'arktypeSchema',
    pkg: '@pyreon/validation',
    snippet: `const adapter = arktypeSchema(arkType)`,
    bindingName: 'adapter',
  },
] as const

function wrap(snippet: string): string {
  return `
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'

function App() {
  ${snippet}
  return <Stack><Text>app</Text></Stack>
}
`
}

describe('Tier-2 Strategy-B silent-drop warnings', () => {
  for (const { callee, pkg, snippet, bindingName } of TIER2_CASES) {
    it(`warns when ${callee}() is used in Swift target`, () => {
      const result = transform(wrap(snippet), { target: 'swift' })
      const tier2Warnings = result.warnings.filter((w) =>
        w.startsWith(`${callee}()`),
      )
      expect(tier2Warnings.length).toBe(1)
      const warning = tier2Warnings[0]!
      expect(warning).toContain(pkg)
      expect(warning).toContain(bindingName)
      expect(warning).toContain('Tier-2 package')
      expect(warning).toContain('Layer 4')
      expect(warning).toContain('NativeIOS')
    })

    it(`warns when ${callee}() is used in Kotlin target`, () => {
      const result = transform(wrap(snippet), { target: 'kotlin' })
      const tier2Warnings = result.warnings.filter((w) =>
        w.startsWith(`${callee}()`),
      )
      expect(tier2Warnings.length).toBe(1)
      const warning = tier2Warnings[0]!
      expect(warning).toContain(pkg)
      expect(warning).toContain(bindingName)
      expect(warning).toContain('NativeAndroid')
    })
  }

  it('does NOT warn on non-Tier-2 calls (regression guard)', () => {
    const source = wrap(`const count = signal(0)
  const doubled = computed(() => count() * 2)`)
    const swiftResult = transform(source, { target: 'swift' })
    const tier2Warnings = swiftResult.warnings.filter(
      (w) =>
        w.startsWith('defineStore()') ||
        w.startsWith('createMachine()') ||
        w.startsWith('createI18n()') ||
        w.startsWith('defineFeature()'),
    )
    expect(tier2Warnings.length).toBe(0)
  })

  it('warns on destructure binding shape with (destructured) marker', () => {
    const source = wrap(
      `const { store, patch } = defineStore("c", () => ({ count: signal(0) }))`,
    )
    const result = transform(source, { target: 'swift' })
    const tier2Warnings = result.warnings.filter((w) =>
      w.startsWith('defineStore()'),
    )
    expect(tier2Warnings.length).toBe(1)
    expect(tier2Warnings[0]!).toContain('(destructured)')
  })

  it('emits NO silent-drop warning for top-level model({state}).create() — Gap 4 state-tree v2 port post-promotion lock', () => {
    // Mirror of the createMachine + createI18n post-port specs.
    // Once #1468's v2 emit ships, `const X = model({...}).create()`
    // at TOP LEVEL is parsed into a ModelDefnIR and emitted as a
    // PyreonModel_<id> singleton — the silent-drop should NOT fire.
    const src = `
import { model } from '@pyreon/state-tree'
import { Stack, Text } from '@pyreon/primitives'

const counter = model({ state: { count: 0, label: 'counter' } }).create()

export function ModelView() {
  return (
    <Stack>
      <Text>{counter.label}</Text>
      <Text>Count: {counter.count}</Text>
    </Stack>
  )
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const result = transform(src, { target })
      const modelWarnings = result.warnings.filter((w) =>
        w.startsWith('model()'),
      )
      expect(modelWarnings.length).toBe(0)
      // Sanity: emit produced code (not empty).
      expect(result.code.length).toBeGreaterThan(0)
      // Sanity: emit produced the per-model class.
      expect(result.code).toContain('PyreonModel_counter')
    }
  })

  it('emits identical warning structure across Swift and Kotlin targets', () => {
    // Both targets must surface the same call + package + binding so
    // an AI agent driving validate() sees consistent diagnostics.
    const source = wrap(
      `const useCounter = defineStore("counter", () => ({ count: signal(0) }))`,
    )
    const swiftWarnings = transform(source, { target: 'swift' }).warnings
    const kotlinWarnings = transform(source, { target: 'kotlin' }).warnings

    const swiftTier2 = swiftWarnings.find((w) => w.startsWith('defineStore()'))
    const kotlinTier2 = kotlinWarnings.find((w) => w.startsWith('defineStore()'))

    expect(swiftTier2).toBeDefined()
    expect(kotlinTier2).toBeDefined()
    // Same call site → same package + binding mention.
    expect(swiftTier2).toContain('@pyreon/store')
    expect(kotlinTier2).toContain('@pyreon/store')
    expect(swiftTier2).toContain('useCounter')
    expect(kotlinTier2).toContain('useCounter')
  })
})

import { describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { lintFile } from '../runner'
import { allRules } from '../rules'
import type { LintConfig } from '../types'

const defaultConfig = (): LintConfig => getPreset('recommended')

const findByRule = (
  result: ReturnType<typeof lintFile>,
  ruleId: string,
): ReturnType<typeof lintFile>['diagnostics'] =>
  result.diagnostics.filter((d) => d.ruleId === ruleId)

describe('pyreon/no-cross-layer-import — core cannot import ui-system', () => {
  it('flags a core package importing @pyreon/styler', () => {
    const result = lintFile(
      '/abs/packages/core/runtime-dom/src/index.ts',
      `import { styled } from '@pyreon/styler'\n`,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-cross-layer-import')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT flag fundamentals importing ui-system (only core is restricted)', () => {
    const result = lintFile(
      '/abs/packages/fundamentals/store/src/index.ts',
      `import { styled } from '@pyreon/styler'\n`,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-cross-layer-import')
    expect(diags.length).toBe(0)
  })

  it('does NOT flag core importing core', () => {
    const result = lintFile(
      '/abs/packages/core/router/src/index.ts',
      `import { signal } from '@pyreon/reactivity'\n`,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-cross-layer-import')
    expect(diags.length).toBe(0)
  })

  it('does NOT flag imports outside @pyreon/*', () => {
    const result = lintFile(
      '/abs/packages/core/runtime-dom/src/index.ts',
      `import { useEffect } from 'react'\n`,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-cross-layer-import')
    expect(diags.length).toBe(0)
  })

  it('does NOT fire in files outside packages/', () => {
    const result = lintFile(
      '/abs/scripts/x.ts',
      `import { styled } from '@pyreon/styler'\n`,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-cross-layer-import')
    expect(diags.length).toBe(0)
  })
})

describe('pyreon/no-circular-import — fires when upper layer imports lower-equal layer', () => {
  it('flags runtime-dom (layer 2) importing router (layer 3)', () => {
    const result = lintFile(
      '/abs/packages/core/runtime-dom/src/index.ts',
      `import { x } from '@pyreon/router'\n`,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-circular-import')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('flags reactivity (layer 0) importing core (layer 1)', () => {
    const result = lintFile(
      '/abs/packages/core/reactivity/src/index.ts',
      `import { h } from '@pyreon/core'\n`,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-circular-import')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT flag core (layer 1) importing reactivity (layer 0)', () => {
    const result = lintFile(
      '/abs/packages/core/core/src/index.ts',
      `import { signal } from '@pyreon/reactivity'\n`,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-circular-import')
    expect(diags.length).toBe(0)
  })

  it('does NOT flag imports from non-Pyreon packages', () => {
    const result = lintFile(
      '/abs/packages/core/runtime-dom/src/index.ts',
      `import { foo } from 'some-third-party'\n`,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-circular-import')
    expect(diags.length).toBe(0)
  })

  it('does NOT fire in files outside packages/core/', () => {
    const result = lintFile(
      '/abs/packages/fundamentals/store/src/index.ts',
      `import { x } from '@pyreon/runtime-dom'\n`,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-circular-import')
    expect(diags.length).toBe(0)
  })

  it('does NOT fire when imported source is not in LAYER_ORDER', () => {
    const result = lintFile(
      '/abs/packages/core/reactivity/src/index.ts',
      `import { x } from '@pyreon/some-other-pkg'\n`,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-circular-import')
    expect(diags.length).toBe(0)
  })
})

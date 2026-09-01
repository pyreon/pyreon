import { describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { lintFile } from '../runner'
import { allRules } from '../rules'
import type { LintConfig } from '../types'

// `no-circular-import` / `no-cross-layer-import` are `scope: 'monorepo'` —
// they hardcode this repo's `@pyreon/*` layer order, so every consumer preset
// forces them off and this repo re-enables them by id in `.pyreonlintrc.json`.
// These specs test the RULES, so they enable them explicitly.
const defaultConfig = (): LintConfig => {
  const base = getPreset('recommended')
  return {
    ...base,
    rules: {
      ...base.rules,
      'pyreon/no-circular-import': 'error',
      'pyreon/no-cross-layer-import': 'error',
    },
  }
}

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

describe('pyreon/no-circular-import — the ui-system tree', () => {
  // The `core` tree was enforced from the start; `ui-system` was not, and it
  // is the tree that actually broke: `ui-core` and `unistyle` formed a real
  // cycle, resolved by the theme-engine registration seam. Nothing but that
  // fix's own tests stood between the repo and its return.
  const at = (file: string, src: string) =>
    findByRule(lintFile(file, src, allRules, defaultConfig()), 'pyreon/no-circular-import')

  it('flags ui-core importing unistyle — the exact edge of the historical cycle', () => {
    expect(
      at(
        '/abs/packages/ui-system/ui-core/src/provider.tsx',
        `import { enrichTheme } from '@pyreon/unistyle'\n`,
      ).length,
    ).toBeGreaterThan(0)
  })

  it('flags styler importing ui-core — styler has no ui-system deps at all', () => {
    expect(
      at('/abs/packages/ui-system/styler/src/index.ts', `import { init } from '@pyreon/ui-core'\n`)
        .length,
    ).toBeGreaterThan(0)
  })

  it('does NOT flag unistyle importing ui-core — that IS the correct direction', () => {
    expect(
      at(
        '/abs/packages/ui-system/unistyle/src/index.ts',
        `import { init } from '@pyreon/ui-core'\n`,
      ),
    ).toEqual([])
  })

  it('does NOT flag a ui-system package importing a CORE one', () => {
    // The two orders are independent stacks. A single merged rank table would
    // make this — the normal direction — a violation in every ui package.
    expect(
      at('/abs/packages/ui-system/elements/src/index.ts', `import { h } from '@pyreon/core'\n`),
    ).toEqual([])
  })

  it('does NOT flag a package it has no documented rank for', () => {
    // `document-primitives` is not in the documented chain. Ranking it by eye
    // put it beside `elements` when it sits above, and produced 41 findings in
    // a tree with no real violation. An unranked package is ignored: a guessed
    // rank is worse than no rank.
    expect(
      at(
        '/abs/packages/ui-system/document-primitives/src/primitives/DocText.ts',
        `import { Text } from '@pyreon/elements'\n`,
      ),
    ).toEqual([])
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

import { AstCache } from '../cache'
import { createIgnoreFilter } from '../config/ignore'
import { loadConfig } from '../config/loader'
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import { applyFixes, lintFile } from '../runner'
import type { ConfigDiagnostic, LintConfig, Rule } from '../types'
import { LineIndex } from '../utils/source'

// Helper to create a config that enables all rules at default severity
function defaultConfig(): LintConfig {
  return getPreset('recommended')
}

/** Build a config where one rule is configured with `exemptPaths` options. */
function configWithExemptPaths(ruleId: string, paths: string[]): LintConfig {
  const base = getPreset('recommended')
  const existing = base.rules[ruleId]
  const severity = Array.isArray(existing) ? existing[0] : existing
  if (severity === undefined || severity === 'off') {
    throw new Error(`configWithExemptPaths: rule ${ruleId} is off in recommended preset`)
  }
  return {
    ...base,
    rules: {
      ...base.rules,
      [ruleId]: [severity, { exemptPaths: paths }] as const,
    },
  }
}

// Helper to lint a string with specific rules
function lintSource(
  source: string,
  rules?: Rule[],
  filePath?: string,
): ReturnType<typeof lintFile> {
  return lintFile(filePath ?? 'test.tsx', source, rules ?? allRules, defaultConfig())
}

// Helper to find diagnostics by rule ID
function findByRule(result: ReturnType<typeof lintFile>, ruleId: string) {
  return result.diagnostics.filter((d) => d.ruleId === ruleId)
}

// Helper to lint with a single rule by ID
function lintWith(ruleId: string, source: string, filePath?: string) {
  const rule = allRules.find((r) => r.meta.id === ruleId)
  if (!rule) throw new Error(`Rule not found: ${ruleId}`)
  return lintFile(filePath ?? 'test.tsx', source, [rule], defaultConfig())
}

// ── Rule Metadata ───────────────────────────────────────────────────────────

describe('Rule metadata', () => {
  it('should have 59 rules', () => {
    expect(allRules.length).toBe(59)
  })

  it('should have unique rule IDs', () => {
    const ids = allRules.map((r) => r.meta.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('all rule IDs should start with pyreon/', () => {
    for (const rule of allRules) {
      expect(rule.meta.id).toMatch(/^pyreon\//)
    }
  })

  it('all rules should have valid categories', () => {
    const validCategories = new Set([
      'reactivity',
      'jsx',
      'lifecycle',
      'performance',
      'ssr',
      'architecture',
      'store',
      'form',
      'styling',
      'hooks',
      'accessibility',
      'router',
    ])
    for (const rule of allRules) {
      expect(validCategories.has(rule.meta.category)).toBe(true)
    }
  })

  it('should have correct category counts', () => {
    const counts: Record<string, number> = {}
    for (const rule of allRules) {
      counts[rule.meta.category] = (counts[rule.meta.category] ?? 0) + 1
    }
    expect(counts.reactivity).toBe(10)
    expect(counts.jsx).toBe(11)
    expect(counts.lifecycle).toBe(4)
    expect(counts.performance).toBe(4)
    expect(counts.ssr).toBe(3)
    expect(counts.architecture).toBe(7)
    expect(counts.store).toBe(3)
    expect(counts.form).toBe(3)
    expect(counts.styling).toBe(4)
    expect(counts.hooks).toBe(3)
    expect(counts.accessibility).toBe(3)
    expect(counts.router).toBe(4)
  })
})

// ── Runner Basics ───────────────────────────────────────────────────────────

describe('Runner', () => {
  it('should parse valid TypeScript/JSX', () => {
    const result = lintSource(`const x = 1`)
    expect(result.diagnostics).toBeDefined()
  })

  it('should skip non-JS files', () => {
    const result = lintFile('test.css', 'body { color: red }', allRules, defaultConfig())
    expect(result.diagnostics.length).toBe(0)
  })

  it('should sort diagnostics by position', () => {
    const source = `
const a = signal(0)
const b = signal(0)
// These are just declared, not used
`
    const rule = allRules.find((r) => r.meta.id === 'pyreon/no-signal-leak')
    if (!rule) throw new Error('Rule not found')
    const result = lintSource(source, [rule])
    if (result.diagnostics.length >= 2) {
      const first = result.diagnostics[0]
      const second = result.diagnostics[1]
      if (first && second) {
        expect(first.span.start).toBeLessThanOrEqual(second.span.start)
      }
    }
  })

  it('should apply fixes in reverse order', () => {
    const source = `<div className="a" htmlFor="b" />`
    const result = lintSource(source)
    const classnameDiags = findByRule(result, 'pyreon/no-classname')
    const htmlforDiags = findByRule(result, 'pyreon/no-htmlfor')

    // Both should be fixable
    expect(classnameDiags.length).toBeGreaterThanOrEqual(1)
    expect(htmlforDiags.length).toBeGreaterThanOrEqual(1)
    expect(classnameDiags[0]?.fix).toBeDefined()
    expect(htmlforDiags[0]?.fix).toBeDefined()

    const fixed = applyFixes(source, result.diagnostics)
    expect(fixed).toContain('class=')
    expect(fixed).toContain('for=')
    expect(fixed).not.toContain('className')
    expect(fixed).not.toContain('htmlFor')
  })

  it('should use AST cache when provided', () => {
    const cache = new AstCache()
    const source = `const x = 1`
    const config = defaultConfig()

    // First lint populates cache
    lintFile('test.ts', source, allRules, config, cache)
    expect(cache.size).toBe(1)

    // Second lint reuses cache
    lintFile('test.ts', source, allRules, config, cache)
    expect(cache.size).toBe(1)
  })
})

// ── Source Utilities ─────────────────────────────────────────────────────────

describe('LineIndex', () => {
  it('should compute line/column for single-line source', () => {
    const idx = new LineIndex('hello world')
    expect(idx.locate(0)).toEqual({ line: 1, column: 0 })
    expect(idx.locate(5)).toEqual({ line: 1, column: 5 })
  })

  it('should compute line/column for multi-line source', () => {
    const idx = new LineIndex('line1\nline2\nline3')
    expect(idx.locate(0)).toEqual({ line: 1, column: 0 })
    expect(idx.locate(6)).toEqual({ line: 2, column: 0 })
    expect(idx.locate(12)).toEqual({ line: 3, column: 0 })
    expect(idx.locate(8)).toEqual({ line: 2, column: 2 })
  })

  it('should handle empty source', () => {
    const idx = new LineIndex('')
    expect(idx.locate(0)).toEqual({ line: 1, column: 0 })
  })
})

// ── AST Cache ──────────────────────────────────────────────────────────────

describe('AstCache', () => {
  it('should store and retrieve entries', () => {
    const cache = new AstCache()
    const lineIndex = new LineIndex('test')
    const program = { type: 'Program' }

    cache.set('test', { program, lineIndex })
    expect(cache.size).toBe(1)

    const result = cache.get('test')
    expect(result).toBeDefined()
    expect(result!.program).toBe(program)
  })

  it('should return undefined for missing entries', () => {
    const cache = new AstCache()
    expect(cache.get('missing')).toBeUndefined()
  })

  it('should clear all entries', () => {
    const cache = new AstCache()
    const lineIndex = new LineIndex('a')
    cache.set('a', { program: {}, lineIndex })
    cache.set('b', { program: {}, lineIndex })
    expect(cache.size).toBe(2)

    cache.clear()
    expect(cache.size).toBe(0)
  })

  it('should use content-based keys (different content = different entry)', () => {
    const cache = new AstCache()
    const lineIndex = new LineIndex('a')
    cache.set('content1', { program: { id: 1 }, lineIndex })
    cache.set('content2', { program: { id: 2 }, lineIndex })
    expect(cache.size).toBe(2)
  })
})

// ── Reactivity Rules ────────────────────────────────────────────────────────

describe('Reactivity rules', () => {
  it('pyreon/no-bare-signal-in-jsx: flags {count()} in JSX', () => {
    const source = `const App = () => <div>{count()}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-bare-signal-in-jsx')
    expect(diags.length).toBe(1)
    expect(diags[0]?.fix).toBeDefined()
  })

  it('pyreon/no-bare-signal-in-jsx: skips PascalCase and use* calls', () => {
    const source = `const App = () => <div>{MyComponent()}{useTheme()}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-bare-signal-in-jsx')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-signal-in-loop: flags signal inside for loop', () => {
    const source = `for (let i = 0; i < 10; i++) { const s = signal(0) }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-signal-in-loop')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-signal-in-loop: clean when outside loop', () => {
    const source = `const s = signal(0)`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-signal-in-loop')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-nested-effect: flags effect inside effect', () => {
    const source = `effect(() => { effect(() => {}) })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-nested-effect')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-peek-in-tracked: flags .peek() inside effect', () => {
    const source = `effect(() => { const v = x.peek() })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-peek-in-tracked')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-unbatched-updates: flags 3+ .set() without batch', () => {
    const source = `function update() { a.set(1); b.set(2); c.set(3) }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-unbatched-updates')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-unbatched-updates: clean with batch', () => {
    const source = `function update() { batch(() => { a.set(1); b.set(2); c.set(3) }) }`
    const result = lintSource(source)
    // The outer function has batch, so no warning on it
    // The inner arrow gets checked too but has no .set() calls directly
    const diags = findByRule(result, 'pyreon/no-unbatched-updates')
    expect(diags.length).toBe(0)
  })

  it('pyreon/prefer-computed: flags effect with single .set()', () => {
    const source = `effect(() => { x.set(a() + b()) })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/prefer-computed')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-effect-assignment: flags effect with single .update()', () => {
    const source = `effect(() => { x.update(v => v + 1) })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-effect-assignment')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-signal-leak: flags unused signal declarations', () => {
    const source = `const unused = signal(0)`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-signal-leak')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-signal-leak: clean when signal is used', () => {
    const source = `const count = signal(0)\nconst double = computed(() => count() * 2)`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-signal-leak')
    expect(diags.length).toBe(0)
  })
})

// ── JSX Rules ───────────────────────────────────────────────────────────────

describe('JSX rules', () => {
  it('pyreon/no-map-in-jsx: flags .map() in JSX', () => {
    const source = `const App = () => <ul>{items.map(i => <li>{i}</li>)}</ul>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-map-in-jsx')
    expect(diags.length).toBe(1)
  })

  it('pyreon/use-by-not-key: flags key on <For>', () => {
    const source = `const App = () => <For each={items} key={r => r.id}>{r => <li />}</For>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/use-by-not-key')
    expect(diags.length).toBe(1)
    expect(diags[0]?.fix).toBeDefined()
  })

  it('pyreon/no-classname: flags className and fixes to class', () => {
    const source = `const App = () => <div className="foo" />`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-classname')
    expect(diags.length).toBe(1)
    expect(diags[0]?.fix).toBeDefined()
  })

  it('pyreon/no-htmlfor: flags htmlFor and fixes to for', () => {
    const source = `const App = () => <label htmlFor="name" />`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-htmlfor')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-onchange: flags onChange on input', () => {
    const source = `const App = () => <input onChange={handler} />`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-onchange')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-onchange: clean on non-input elements', () => {
    const source = `const App = () => <div onChange={handler} />`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-onchange')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-ternary-conditional: flags ternary with JSX', () => {
    const source = `const App = () => <div>{flag ? <span>a</span> : <span>b</span>}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-ternary-conditional')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-and-conditional: flags && with JSX', () => {
    const source = `const App = () => <div>{flag && <span>yes</span>}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-and-conditional')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-missing-for-by: flags <For> without by', () => {
    const source = `const App = () => <For each={items}>{r => <li />}</For>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-missing-for-by')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-missing-for-by: clean when by is present', () => {
    const source = `const App = () => <For each={items} by={r => r.id}>{r => <li />}</For>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-missing-for-by')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-props-destructure: flags destructured props in component', () => {
    const source = `const App = ({ name }) => <div>{name}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-props-destructure')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-props-destructure: clean for non-component functions', () => {
    const source = `const fn = ({ a, b }) => a + b`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-props-destructure')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-index-as-by: flags by={(_, i) => i}', () => {
    const source = `const App = () => <For each={items} by={(_, i) => i}>{r => <li />}</For>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-index-as-by')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-children-access: flags props.children in renderer file', () => {
    const result = lintWith(
      'pyreon/no-children-access',
      `import { renderToString } from "@pyreon/runtime-server"\nconst c = props.children`,
      'renderer.ts',
    )
    expect(result.diagnostics.length).toBe(1)
  })

  it('pyreon/no-children-access: clean in non-renderer file', () => {
    const result = lintWith(
      'pyreon/no-children-access',
      `const c = props.children`,
      'component.tsx',
    )
    expect(result.diagnostics.length).toBe(0)
  })
})

// ── Lifecycle Rules ─────────────────────────────────────────────────────────

describe('Lifecycle rules', () => {
  it('pyreon/no-missing-cleanup: flags onMount with setInterval and no return', () => {
    const source = `onMount(() => { setInterval(() => {}, 1000) })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-missing-cleanup')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-missing-cleanup: clean when onMount returns cleanup', () => {
    const source = `onMount(() => { const id = setInterval(() => {}, 1000); return () => clearInterval(id) })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-missing-cleanup')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-mount-in-effect: flags onMount inside effect', () => {
    const source = `effect(() => { onMount(() => {}) })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-mount-in-effect')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-effect-in-mount: flags effect inside onMount', () => {
    const source = `onMount(() => { effect(() => {}) })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-effect-in-mount')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-dom-in-setup: flags document.querySelector outside onMount', () => {
    const source = `const el = document.querySelector(".app")`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-dom-in-setup')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-dom-in-setup: clean inside onMount', () => {
    const source = `onMount(() => { document.querySelector(".app") })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-dom-in-setup')
    expect(diags.length).toBe(0)
  })
})

// ── Performance Rules ───────────────────────────────────────────────────────

describe('Performance rules', () => {
  it('pyreon/no-eager-import: flags static import of heavy packages', () => {
    const source = `import { Chart } from "@pyreon/charts"`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-eager-import')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-eager-import: clean for lightweight packages', () => {
    const source = `import { signal } from "@pyreon/reactivity"`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-eager-import')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-effect-in-for: flags effect() inside <For>', () => {
    const result = lintWith(
      'pyreon/no-effect-in-for',
      `const App = () => <For each={items}>{r => { effect(() => {}); return <li /> }}</For>`,
    )
    expect(result.diagnostics.length).toBe(1)
  })

  it('pyreon/no-effect-in-for: clean when effect is outside <For>', () => {
    const result = lintWith(
      'pyreon/no-effect-in-for',
      `effect(() => {})\nconst App = () => <For each={items}>{r => <li />}</For>`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/no-large-for-without-by: flags <For> without by prop', () => {
    const result = lintWith(
      'pyreon/no-large-for-without-by',
      `const App = () => <For each={items}>{r => <li />}</For>`,
    )
    expect(result.diagnostics.length).toBe(1)
  })

  it('pyreon/no-large-for-without-by: clean with by prop', () => {
    const result = lintWith(
      'pyreon/no-large-for-without-by',
      `const App = () => <For each={items} by={r => r.id}>{r => <li />}</For>`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/prefer-show-over-display: flags conditional display style', () => {
    const result = lintWith(
      'pyreon/prefer-show-over-display',
      `const App = () => <div style={{ display: visible ? "block" : "none" }} />`,
    )
    expect(result.diagnostics.length).toBe(1)
  })

  it('pyreon/prefer-show-over-display: clean with static display', () => {
    const result = lintWith(
      'pyreon/prefer-show-over-display',
      `const App = () => <div style={{ display: "block" }} />`,
    )
    expect(result.diagnostics.length).toBe(0)
  })
})

// ── SSR Rules ───────────────────────────────────────────────────────────────

describe('SSR rules', () => {
  it('pyreon/no-window-in-ssr: flags window outside onMount', () => {
    const source = `const w = window.innerWidth`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-window-in-ssr')
    expect(diags.length).toBeGreaterThanOrEqual(1)
  })

  it('pyreon/no-window-in-ssr: clean inside onMount', () => {
    const source = `onMount(() => { const w = window.innerWidth })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-window-in-ssr')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-window-in-ssr: clean with typeof guard', () => {
    const source = `if (typeof window !== "undefined") { const w = window.innerWidth }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-window-in-ssr')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-window-in-ssr: exempt via configured exemptPaths', () => {
    const source = `const w = window.innerWidth; document.createElement('div')`
    const cfg = configWithExemptPaths('pyreon/no-window-in-ssr', [
      'packages/core/runtime-dom/',
    ])
    const result = lintFile('packages/core/runtime-dom/src/foo.ts', source, allRules, cfg)
    const diags = findByRule(result, 'pyreon/no-window-in-ssr')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-window-in-ssr: fires in same path when exemptPaths is not configured', () => {
    const source = `const w = window.innerWidth`
    const result = lintFile(
      'packages/core/runtime-dom/src/foo.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-window-in-ssr')
    // With no exemptPaths configured, the rule applies everywhere —
    // this is the correct default for a rule shipping to user apps.
    expect(diags.length).toBeGreaterThanOrEqual(1)
  })

  it('pyreon/no-mismatch-risk: flags Date.now() in JSX', () => {
    const source = `const App = () => <div>{Date.now()}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-mismatch-risk')
    expect(diags.length).toBe(1)
  })

  it('pyreon/prefer-request-context: flags module-level signal in server file', () => {
    const source = `const state = signal(0)`
    const result = lintFile('app.server.ts', source, allRules, defaultConfig())
    const diags = findByRule(result, 'pyreon/prefer-request-context')
    expect(diags.length).toBe(1)
  })
})

// ── Architecture Rules ──────────────────────────────────────────────────────

describe('Architecture rules', () => {
  it('pyreon/no-deep-import: flags @pyreon/*/src/ imports', () => {
    const source = `import { something } from "@pyreon/core/src/signal"`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-deep-import')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-deep-import: clean for normal imports', () => {
    const source = `import { signal } from "@pyreon/reactivity"`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-deep-import')
    expect(diags.length).toBe(0)
  })

  it('pyreon/dev-guard-warnings: flags console.warn without __DEV__', () => {
    const source = `console.warn("something")`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(1)
  })

  it('pyreon/dev-guard-warnings: clean inside __DEV__ guard', () => {
    const source = `if (__DEV__) { console.warn("something") }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(0)
  })

  it('pyreon/dev-guard-warnings: clean in test files', () => {
    const source = `console.warn("test warning")`
    const result = lintFile('src/tests/foo.test.ts', source, allRules, defaultConfig())
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(0)
  })

  it('pyreon/dev-guard-warnings: clean inside `if (__DEV__ && X)` compound guard', () => {
    const source = `if (__DEV__ && cond) { console.warn("x") }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(0)
  })

  it('pyreon/dev-guard-warnings: clean inside `if (X && __DEV__)` compound guard', () => {
    const source = `if (cond && __DEV__) { console.warn("x") }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(0)
  })

  it('pyreon/dev-guard-warnings: clean inside `__DEV__ && console.warn(...)` short-circuit', () => {
    const source = `__DEV__ && console.warn("x")`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(0)
  })

  it('pyreon/dev-guard-warnings: clean inside `__DEV__ ? warn : null` ternary', () => {
    const source = `__DEV__ ? console.warn("x") : null`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(0)
  })

  it('pyreon/dev-guard-warnings: exempts console.error inside catch (production error reporting)', () => {
    const source = `try { foo() } catch (err) { console.error("[Pyreon]", err) }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(0)
  })

  it('pyreon/dev-guard-warnings: still flags console.warn inside catch (warns must be DEV-only)', () => {
    const source = `try { foo() } catch (err) { console.warn("[Pyreon]", err) }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(1)
  })

  it('pyreon/dev-guard-warnings: clean inside `if (import.meta.env.DEV)` guard', () => {
    const source = `if (import.meta.env.DEV) { console.warn("x") }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(0)
  })

  it('pyreon/dev-guard-warnings: clean after early-return DEV guard at top of function', () => {
    const source = `function warn() {
      if (!__DEV__) return
      console.warn("a"); console.warn("b"); console.warn("c")
    }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(0)
  })

  it('pyreon/dev-guard-warnings: clean after early-return `import.meta.env.DEV` guard', () => {
    const source = `function warn() {
      if (!import.meta.env?.DEV) return
      console.warn("x")
    }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dev-guard-warnings')
    expect(diags.length).toBe(0)
  })

  // ── pyreon/no-process-dev-gate ────────────────────────────────────────────
  // The recurring browser-dead-code bug we fixed in PR #200. Tests cover:
  //   - the canonical broken pattern (typeof process first, NODE_ENV second)
  //   - the reversed pattern (NODE_ENV first, typeof process second)
  //   - assignment context (const __DEV__ = ...) and inline use
  //   - the auto-fix output is the import.meta.env.DEV form
  //   - server packages are exempt (the pattern is correct in Node)
  //   - test files are exempt
  //   - the correct pattern (import.meta.env.DEV) does NOT trigger the rule

  it('pyreon/no-process-dev-gate: flags the canonical broken __DEV__ assignment', () => {
    const source = `const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`
    const result = lintFile(
      'packages/core/runtime-dom/src/transition.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-process-dev-gate')
    expect(diags.length).toBe(1)
    expect(diags[0]?.fix).toBeDefined()
    expect(diags[0]?.fix?.replacement).toBe('import.meta.env?.DEV === true')
  })

  it('pyreon/no-process-dev-gate: flags the reversed pattern (NODE_ENV first)', () => {
    const source = `const __DEV__ = process.env.NODE_ENV !== 'production' && typeof process !== 'undefined'`
    const result = lintFile(
      'packages/core/runtime-dom/src/transition.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-process-dev-gate')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-process-dev-gate: flags inline use, not just assignment', () => {
    // The pattern should be caught wherever it appears, not just in
    // const declarations.
    const source = `if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') { console.warn('hi') }`
    const result = lintFile(
      'packages/core/runtime-dom/src/transition.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-process-dev-gate')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-process-dev-gate: clean for the correct import.meta.env.DEV pattern', () => {
    const source = `if (!import.meta.env?.DEV) return`
    const result = lintFile(
      'packages/core/runtime-dom/src/transition.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-process-dev-gate')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-process-dev-gate: exempt via configured exemptPaths (server-only code)', () => {
    const source = `const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`
    const cfg = configWithExemptPaths('pyreon/no-process-dev-gate', [
      'packages/core/server/',
    ])
    const result = lintFile('packages/core/server/src/handler.ts', source, allRules, cfg)
    const diags = findByRule(result, 'pyreon/no-process-dev-gate')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-process-dev-gate: exemptPaths covers multiple directories', () => {
    const source = `const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`
    const cfg = configWithExemptPaths('pyreon/no-process-dev-gate', [
      'packages/core/runtime-server/',
      'packages/zero/',
      'packages/tools/vite-plugin/',
    ])
    for (const path of [
      'packages/core/runtime-server/src/index.ts',
      'packages/zero/zero/src/logger.ts',
      'packages/tools/vite-plugin/src/index.ts',
    ]) {
      const result = lintFile(path, source, allRules, cfg)
      const diags = findByRule(result, 'pyreon/no-process-dev-gate')
      expect(diags.length, `expected ${path} to be exempt`).toBe(0)
    }
  })

  it('pyreon/no-process-dev-gate: exempts test files', () => {
    const source = `const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`
    const result = lintFile(
      'packages/core/runtime-dom/src/tests/transition.test.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-process-dev-gate')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-process-dev-gate: does NOT flag isolated typeof process check', () => {
    // A bare `typeof process !== 'undefined'` (e.g., for SSR detection) is
    // fine — it's the COMBINATION with NODE_ENV check that flags as a dev
    // gate. This protects against false positives on legitimate isomorphic code.
    const source = `if (typeof process !== 'undefined') { console.log('node') }`
    const result = lintFile(
      'packages/core/runtime-dom/src/transition.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-process-dev-gate')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-process-dev-gate: does NOT flag isolated NODE_ENV check', () => {
    // Bare NODE_ENV check (without the typeof process guard) is also fine
    // — it's not the dead-in-browser pattern.
    const source = `if (process.env.NODE_ENV !== 'production') { /* ... */ }`
    const result = lintFile(
      'packages/core/runtime-dom/src/transition.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-process-dev-gate')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-process-dev-gate: codebase-wide check — all browser packages are clean', async () => {
    // Meta-test: scan every browser-package source file and assert NONE
    // of them contain the broken pattern. If a future PR introduces a
    // new file with `typeof process !== 'undefined' && process.env...`
    // anywhere in the browser packages, this test fails immediately
    // (in addition to the per-file lint rule firing on `bun run lint`).
    //
    // The lint rule by itself is the primary defence — this meta-test
    // is the safety net for cases where someone might disable the rule
    // for a single file or commit. The two layers together make the
    // bug class impossible to reintroduce silently.
    const fs = await import('node:fs')
    const path = await import('node:path')

    // Resolve the workspace root by walking up from this test file.
    // This test file lives at `packages/tools/lint/src/tests/runner.test.ts`,
    // so 5 levels up gets us to the workspace root.
    const workspaceRoot = path.resolve(import.meta.dirname, '../../../../..')

    // The list of source roots to scan. Mirrors the lint rule's
    // SERVER_PACKAGE_PATTERNS exemption — these are the BROWSER-running
    // packages that must be clean.
    const browserPackageRoots = [
      'packages/core/core/src',
      'packages/core/runtime-dom/src',
      'packages/core/router/src',
      'packages/core/head/src',
      'packages/fundamentals/flow/src',
      'packages/fundamentals/code/src',
      'packages/fundamentals/charts/src',
      'packages/fundamentals/document/src',
      'packages/fundamentals/form/src',
      'packages/fundamentals/hooks/src',
      'packages/fundamentals/store/src',
      'packages/fundamentals/state-tree/src',
      'packages/ui-system/styler/src',
      'packages/ui-system/unistyle/src',
      'packages/ui-system/elements/src',
      'packages/ui-system/rocketstyle/src',
      'packages/ui-system/coolgrid/src',
      'packages/ui-system/kinetic/src',
      'packages/ui-system/document-primitives/src',
      'packages/ui-system/connector-document/src',
      'packages/ui/components/src',
      'packages/ui/primitives/src',
    ]

    // Recursively walk a directory and collect all .ts/.tsx files
    // (excluding tests).
    function walk(dir: string, out: string[] = []): string[] {
      let entries: import('node:fs').Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        // Directory may not exist (e.g., new package not yet created).
        // The test should pass — this is a clean state.
        return out
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          // Skip test directories — the lint rule exempts them and
          // they may legitimately use `process` for test env detection.
          if (
            entry.name === 'tests' ||
            entry.name === '__tests__' ||
            entry.name === 'test' ||
            entry.name === 'node_modules' ||
            entry.name === 'dist' ||
            entry.name === 'lib'
          ) {
            continue
          }
          walk(full, out)
        } else if (
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
          !entry.name.endsWith('.d.ts') &&
          !entry.name.includes('.test.') &&
          !entry.name.includes('.spec.')
        ) {
          out.push(full)
        }
      }
      return out
    }

    const offenders: string[] = []
    // The exact pattern we forbid. We use a strict regex that requires
    // the FULL combined pattern including the `&&` and the NODE_ENV
    // check, which only appears in actual buggy code (not isolated
    // typeof process or NODE_ENV checks).
    const brokenPattern =
      /typeof\s+process\s*!==\s*['"]undefined['"]\s*&&\s*process\.env\.NODE_ENV\s*!==\s*['"]production['"]/

    // Strip comments before matching — explanation comments in fixed
    // files (e.g., `flow/src/layout.ts:warnIgnoredOptions`) legitimately
    // mention the bad pattern as documentation. We only care about
    // executable code.
    function stripComments(source: string): string {
      return source
        .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
        .replace(/^\s*\/\/.*$/gm, '') // line comments at start of line
        .replace(/([^:])\/\/.*$/gm, '$1') // trailing line comments (avoid breaking URLs)
    }

    for (const root of browserPackageRoots) {
      const absRoot = path.join(workspaceRoot, root)
      const files = walk(absRoot)
      for (const file of files) {
        const source = fs.readFileSync(file, 'utf-8')
        const codeOnly = stripComments(source)
        if (brokenPattern.test(codeOnly)) {
          offenders.push(path.relative(workspaceRoot, file))
        }
      }
    }

    // If this fails, the offending files are listed. Each one needs
    // the broken pattern replaced with `import.meta.env?.DEV === true`
    // (or the inline `if (!import.meta.env?.DEV) return` form). See
    // `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions`
    // for the reference implementation.
    expect(
      offenders,
      `Browser-package source files with the broken \`typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'\` dev gate. ` +
        `This pattern is dead code in real Vite browser bundles because Vite does not polyfill \`process\`. ` +
        `Replace with \`const __DEV__ = import.meta.env?.DEV === true\`. ` +
        `See pyreon/no-process-dev-gate lint rule for details.`,
    ).toEqual([])
  })

  it('pyreon/no-error-without-prefix: flags throw without [Pyreon]', () => {
    const source = `throw new Error("something went wrong")`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-error-without-prefix')
    expect(diags.length).toBe(1)
    expect(diags[0]?.fix).toBeDefined()
  })

  it('pyreon/no-error-without-prefix: clean with [Pyreon] prefix', () => {
    const source = `throw new Error("[Pyreon] something went wrong")`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-error-without-prefix')
    expect(diags.length).toBe(0)
  })
})

// ── Store Rules ─────────────────────────────────────────────────────────────

describe('Store rules', () => {
  it('pyreon/no-duplicate-store-id: flags duplicate IDs', () => {
    const source = `
defineStore("counter", () => {})
defineStore("counter", () => {})
`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-duplicate-store-id')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-duplicate-store-id: clean with unique IDs', () => {
    const source = `
defineStore("counter", () => {})
defineStore("user", () => {})
`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-duplicate-store-id')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-mutate-store-state: flags store.signal.set() inside a component', () => {
    const result = lintWith(
      'pyreon/no-mutate-store-state',
      `function MyComp() { userStore.count.set(5) }`,
    )
    expect(result.diagnostics.length).toBe(1)
  })

  it('pyreon/no-mutate-store-state: clean for non-store .set()', () => {
    const result = lintWith('pyreon/no-mutate-store-state', `count.set(5)`)
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/no-store-outside-provider: flags store hooks in server files without provider', () => {
    const result = lintWith(
      'pyreon/no-store-outside-provider',
      `useCounterStore()`,
      'app.server.ts',
    )
    expect(result.diagnostics.length).toBe(1)
  })

  it('pyreon/no-store-outside-provider: clean when provider is imported', () => {
    const result = lintWith(
      'pyreon/no-store-outside-provider',
      `import { runWithRequestContext } from "@pyreon/reactivity"\nuseCounterStore()`,
      'app.server.ts',
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/no-store-outside-provider: clean in non-server files', () => {
    const result = lintWith('pyreon/no-store-outside-provider', `useCounterStore()`, 'app.tsx')
    expect(result.diagnostics.length).toBe(0)
  })
})

// ── Form Rules ──────────────────────────────────────────────────────────────

describe('Form rules', () => {
  it('pyreon/no-submit-without-validation: flags useForm with onSubmit but no validators', () => {
    const source = `const form = useForm({ initialValues: {}, onSubmit: () => {} })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-submit-without-validation')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-submit-without-validation: clean with validators', () => {
    const source = `const form = useForm({ initialValues: {}, onSubmit: () => {}, validators: {} })`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-submit-without-validation')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-unregistered-field: flags useField without register()', () => {
    const result = lintWith('pyreon/no-unregistered-field', `const name = useField(form, "name")`)
    expect(result.diagnostics.length).toBe(1)
    expect(result.diagnostics[0]!.message).toContain('register')
  })

  it('pyreon/no-unregistered-field: clean when register is called', () => {
    const result = lintWith(
      'pyreon/no-unregistered-field',
      `const name = useField(form, "name")\nname.register()`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/prefer-field-array: flags signal([]) in form files', () => {
    const result = lintWith(
      'pyreon/prefer-field-array',
      `import { useForm } from "@pyreon/form"\nconst items = signal([])`,
    )
    expect(result.diagnostics.length).toBe(1)
    expect(result.diagnostics[0]!.message).toContain('useFieldArray')
  })

  it('pyreon/prefer-field-array: clean when not in form file', () => {
    const result = lintWith('pyreon/prefer-field-array', `const items = signal([])`)
    expect(result.diagnostics.length).toBe(0)
  })
})

// ── Styling Rules ───────────────────────────────────────────────────────────

describe('Styling rules', () => {
  it('pyreon/no-inline-style-object: flags style={{...}} in JSX', () => {
    const source = `const App = () => <div style={{ color: "red" }} />`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-inline-style-object')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-dynamic-styled: flags styled() inside function', () => {
    const source = `function App() { const Box = styled("div"); return null }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-dynamic-styled')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-dynamic-styled: clean at module level', () => {
    const source = `const Box = styled("div")`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-dynamic-styled')
    expect(diags.length).toBe(0)
  })

  it('pyreon/prefer-cx: flags string concatenation in class attribute', () => {
    const result = lintWith('pyreon/prefer-cx', `const App = () => <div class={"foo " + bar} />`)
    expect(result.diagnostics.length).toBe(1)
    expect(result.diagnostics[0]!.message).toContain('cx()')
  })

  it('pyreon/prefer-cx: flags template literal in class attribute', () => {
    const result = lintWith('pyreon/prefer-cx', 'const App = () => <div class={`foo ${bar}`} />')
    expect(result.diagnostics.length).toBe(1)
  })

  it('pyreon/prefer-cx: clean with plain string class', () => {
    const result = lintWith('pyreon/prefer-cx', `const App = () => <div class="foo bar" />`)
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/no-theme-outside-provider: flags useTheme() without provider import', () => {
    const result = lintWith('pyreon/no-theme-outside-provider', `const theme = useTheme()`)
    expect(result.diagnostics.length).toBe(1)
  })

  it('pyreon/no-theme-outside-provider: clean when PyreonUI is imported', () => {
    const result = lintWith(
      'pyreon/no-theme-outside-provider',
      `import { PyreonUI } from "@pyreon/ui-core"\nconst theme = useTheme()`,
    )
    expect(result.diagnostics.length).toBe(0)
  })
})

// ── Hooks Rules ─────────────────────────────────────────────────────────────

describe('Hooks rules', () => {
  it('pyreon/no-raw-addeventlistener: flags .addEventListener()', () => {
    const source = `el.addEventListener("click", handler)`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-raw-addeventlistener')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-raw-addeventlistener: exempt via configured exemptPaths', () => {
    const source = `el.addEventListener("click", handler)`
    const cfg = configWithExemptPaths('pyreon/no-raw-addeventlistener', [
      'packages/core/runtime-dom/',
      'packages/fundamentals/hooks/',
    ])
    for (const path of [
      'packages/core/runtime-dom/src/delegate.ts',
      'packages/fundamentals/hooks/src/useClickOutside.ts',
    ]) {
      const result = lintFile(path, source, allRules, cfg)
      const diags = findByRule(result, 'pyreon/no-raw-addeventlistener')
      expect(diags.length, `expected ${path} to be exempt`).toBe(0)
    }
  })

  it('pyreon/no-raw-setinterval: flags setInterval inside a component (outside onMount)', () => {
    const source = `function MyComp() { setInterval(() => {}, 1000) }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-raw-setinterval')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-raw-setinterval: exempt via configured exemptPaths', () => {
    // Wrap in a component so component-context fires; exemptPaths then overrides.
    const source = `function useInterval() { setInterval(() => callback(), d) }`
    const cfg = configWithExemptPaths('pyreon/no-raw-setinterval', [
      'packages/fundamentals/hooks/',
    ])
    const result = lintFile(
      'packages/fundamentals/hooks/src/useInterval.ts',
      source,
      allRules,
      cfg,
    )
    const diags = findByRule(result, 'pyreon/no-raw-setinterval')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-raw-localstorage: flags localStorage.getItem() inside a component', () => {
    const source = `function MyComp() { const v = localStorage.getItem("key") }`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-raw-localstorage')
    expect(diags.length).toBe(1)
  })
})

// ── Accessibility Rules ─────────────────────────────────────────────────────

describe('Accessibility rules', () => {
  it('pyreon/dialog-a11y: flags <dialog> without aria-label', () => {
    const source = `const App = () => <dialog><p>Hello</p></dialog>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dialog-a11y')
    expect(diags.length).toBe(1)
  })

  it('pyreon/dialog-a11y: clean with aria-label', () => {
    const source = `const App = () => <dialog aria-label="My dialog"><p>Hello</p></dialog>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/dialog-a11y')
    expect(diags.length).toBe(0)
  })

  it('pyreon/overlay-a11y: flags <Overlay> without role', () => {
    const source = `const App = () => <Overlay><p>Hello</p></Overlay>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/overlay-a11y')
    expect(diags.length).toBe(1)
  })

  it('pyreon/overlay-a11y: clean with role', () => {
    const source = `const App = () => <Overlay role="dialog"><p>Hello</p></Overlay>`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/overlay-a11y')
    expect(diags.length).toBe(0)
  })

  it('pyreon/toast-a11y: flags Toast component without role or aria-live', () => {
    const result = lintWith('pyreon/toast-a11y', `const App = () => <ToastItem message="hello" />`)
    expect(result.diagnostics.length).toBe(1)
    expect(result.diagnostics[0]!.message).toContain('role')
  })

  it('pyreon/toast-a11y: clean with role attribute', () => {
    const result = lintWith(
      'pyreon/toast-a11y',
      `const App = () => <ToastItem role="alert" message="hello" />`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/toast-a11y: clean with aria-live attribute', () => {
    const result = lintWith(
      'pyreon/toast-a11y',
      `const App = () => <ToastItem aria-live="polite" message="hello" />`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/toast-a11y: skips Toaster container', () => {
    const result = lintWith('pyreon/toast-a11y', `const App = () => <Toaster />`)
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/toast-a11y: skips non-toast PascalCase components', () => {
    const result = lintWith('pyreon/toast-a11y', `const App = () => <Button />`)
    expect(result.diagnostics.length).toBe(0)
  })
})

// ── Router Rules ────────────────────────────────────────────────────────────

describe('Router rules', () => {
  it('pyreon/no-href-navigation: flags <a href> in router file', () => {
    const result = lintWith(
      'pyreon/no-href-navigation',
      `import { Link } from "@pyreon/router"\nconst App = () => <a href="/about">About</a>`,
    )
    expect(result.diagnostics.length).toBe(1)
    expect(result.diagnostics[0]!.message).toContain('<Link>')
  })

  it('pyreon/no-href-navigation: clean for external URLs', () => {
    const result = lintWith(
      'pyreon/no-href-navigation',
      `import { Link } from "@pyreon/router"\nconst App = () => <a href="https://example.com">External</a>`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/no-href-navigation: clean for anchor links', () => {
    const result = lintWith(
      'pyreon/no-href-navigation',
      `import { Link } from "@pyreon/router"\nconst App = () => <a href="#section">Jump</a>`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/no-href-navigation: clean without router import', () => {
    const result = lintWith(
      'pyreon/no-href-navigation',
      `const App = () => <a href="/about">About</a>`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/no-imperative-navigate-in-render: flags navigate() in component body', () => {
    const result = lintWith(
      'pyreon/no-imperative-navigate-in-render',
      `const App = () => { navigate("/home"); return <div /> }`,
    )
    expect(result.diagnostics.length).toBe(1)
    expect(result.diagnostics[0]!.message).toContain('infinite')
  })

  it('pyreon/no-imperative-navigate-in-render: clean inside onMount', () => {
    const result = lintWith(
      'pyreon/no-imperative-navigate-in-render',
      `const App = () => { onMount(() => { navigate("/home") }); return <div /> }`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/no-imperative-navigate-in-render: clean in non-component', () => {
    const result = lintWith(
      'pyreon/no-imperative-navigate-in-render',
      `const handle = () => { navigate("/home") }`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/no-missing-fallback: flags route config without catch-all', () => {
    const result = lintWith(
      'pyreon/no-missing-fallback',
      `import { Router } from "@pyreon/router"\nconst routes = [{ path: "/", component: Home }, { path: "/about", component: About }]`,
    )
    expect(result.diagnostics.length).toBe(1)
    expect(result.diagnostics[0]!.message).toContain('catch-all')
  })

  it('pyreon/no-missing-fallback: clean with catch-all route', () => {
    const result = lintWith(
      'pyreon/no-missing-fallback',
      `import { Router } from "@pyreon/router"\nconst routes = [{ path: "/", component: Home }, { path: "*", component: NotFound }]`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/no-missing-fallback: clean without router import', () => {
    const result = lintWith(
      'pyreon/no-missing-fallback',
      `const routes = [{ path: "/", component: Home }]`,
    )
    expect(result.diagnostics.length).toBe(0)
  })

  it('pyreon/prefer-use-is-active: flags location.pathname === comparison', () => {
    const result = lintWith(
      'pyreon/prefer-use-is-active',
      `const active = location.pathname === "/admin"`,
    )
    expect(result.diagnostics.length).toBe(1)
    expect(result.diagnostics[0]!.message).toContain('useIsActive')
  })

  it('pyreon/prefer-use-is-active: flags route.path === comparison', () => {
    const result = lintWith('pyreon/prefer-use-is-active', `const active = route.path === "/admin"`)
    expect(result.diagnostics.length).toBe(1)
  })

  it('pyreon/prefer-use-is-active: clean for unrelated comparisons', () => {
    const result = lintWith('pyreon/prefer-use-is-active', `const active = name === "admin"`)
    expect(result.diagnostics.length).toBe(0)
  })
})

// ── Config Loading ──────────────────────────────────────────────────────────

describe('Config loading', () => {
  it('loadConfig returns null when no config file exists', () => {
    // Use a path where there's definitely no config
    const result = loadConfig('/tmp/nonexistent-pyreon-dir-12345')
    expect(result).toBeNull()
  })
})

// ── Ignore Filter ───────────────────────────────────────────────────────────

describe('Ignore filter', () => {
  it('createIgnoreFilter returns a function', () => {
    const filter = createIgnoreFilter('/tmp/nonexistent-pyreon-dir-12345')
    expect(typeof filter).toBe('function')
  })

  it('filter returns false for paths when no ignore files exist', () => {
    const filter = createIgnoreFilter('/tmp/nonexistent-pyreon-dir-12345')
    expect(filter('/tmp/nonexistent-pyreon-dir-12345/src/app.ts')).toBe(false)
  })
})

// ── Presets ─────────────────────────────────────────────────────────────────

describe('Presets', () => {
  it('recommended should include all rules', () => {
    const config = getPreset('recommended')
    expect(Object.keys(config.rules).length).toBe(59)
  })

  it('strict should promote all warns to errors', () => {
    const recommended = getPreset('recommended')
    const strict = getPreset('strict')
    for (const [id, sev] of Object.entries(recommended.rules)) {
      if (sev === 'warn') {
        expect(strict.rules[id]).toBe('error')
      }
    }
  })

  it('app should disable library-specific rules', () => {
    const app = getPreset('app')
    expect(app.rules['pyreon/dev-guard-warnings']).toBe('off')
    expect(app.rules['pyreon/no-error-without-prefix']).toBe('off')
    expect(app.rules['pyreon/no-circular-import']).toBe('off')
    expect(app.rules['pyreon/no-cross-layer-import']).toBe('off')
  })

  it('app preset KEEPS no-process-dev-gate enabled (browser bug, not a lib-only concern)', () => {
    // The browser-dead-code bug hits user-facing code regardless of
    // whether the project is a library or an app. Apps that build for
    // the browser still need the warning.
    const app = getPreset('app')
    expect(app.rules['pyreon/no-process-dev-gate']).toBe('error')
  })

  it('lib should have architecture rules as error', () => {
    const lib = getPreset('lib')
    expect(lib.rules['pyreon/no-circular-import']).toBe('error')
    expect(lib.rules['pyreon/no-cross-layer-import']).toBe('error')
    expect(lib.rules['pyreon/dev-guard-warnings']).toBe('error')
    expect(lib.rules['pyreon/no-process-dev-gate']).toBe('error')
  })
})

// ── Component-context detection (B-rules) ──────────────────────────────────
//
// Four rules only matter inside a component or hook setup body. They no
// longer rely on `isTestFile` path heuristics — the
// `createComponentContextTracker()` utility detects the semantic context
// directly. Module-level + utility-function callsites are exempt by design;
// test callbacks (anonymous arrows passed to `it()`) are exempt because
// they aren't named like a component or hook.

describe('component-context exemption (rules that only fire inside components/hooks)', () => {
  const cases: Array<[string, string]> = [
    ['pyreon/no-raw-setinterval', `setInterval(() => {}, 100)`],
    ['pyreon/no-dynamic-styled', `function helper() { styled('div')\`color:red\` }`],
    ['pyreon/no-raw-localstorage', `localStorage.getItem('k')`],
    ['pyreon/no-mutate-store-state', `store.count.set(5)`],
  ]

  for (const [rule, source] of cases) {
    it(`${rule}: silent at module scope (no component on the stack)`, () => {
      const result = lintSource(source)
      const diags = findByRule(result, rule)
      expect(diags.length).toBe(0)
    })

    it(`${rule}: silent in plain utility function (PascalCase / use-prefix not present)`, () => {
      const wrapped = `function doStuff() { ${source} }`
      const result = lintSource(wrapped)
      const diags = findByRule(result, rule)
      expect(diags.length).toBe(0)
    })

    it(`${rule}: silent in a test callback (anonymous arrow)`, () => {
      const wrapped = `it('does the thing', () => { ${source} })`
      const result = lintSource(wrapped)
      const diags = findByRule(result, rule)
      expect(diags.length).toBe(0)
    })

    it(`${rule}: fires inside a PascalCase component`, () => {
      const wrapped = `function MyComp() { ${source} }`
      const result = lintSource(wrapped)
      const diags = findByRule(result, rule)
      expect(diags.length).toBeGreaterThanOrEqual(1)
    })

    it(`${rule}: fires inside a use-prefixed hook`, () => {
      const wrapped = `function useThing() { ${source} }`
      const result = lintSource(wrapped)
      const diags = findByRule(result, rule)
      expect(diags.length).toBeGreaterThanOrEqual(1)
    })

    it(`${rule}: fires inside an arrow-form component (\`const MyComp = () => …\`)`, () => {
      const wrapped = `const MyComp = () => { ${source} }`
      const result = lintSource(wrapped)
      const diags = findByRule(result, rule)
      expect(diags.length).toBeGreaterThanOrEqual(1)
    })

    it(`${rule}: fires inside an arrow-form hook (\`const useFoo = () => …\`)`, () => {
      const wrapped = `const useFoo = () => { ${source} }`
      const result = lintSource(wrapped)
      const diags = findByRule(result, rule)
      expect(diags.length).toBeGreaterThanOrEqual(1)
    })
  }
})

// Arrow-form hook implementations are now correctly detected by
// `no-theme-outside-provider` (fixes a silent bug where the rule ignored
// the most common React/Solid hook idiom).
describe('no-theme-outside-provider: arrow-form hook implementation', () => {
  it('silent inside `const useFoo = (...) => { useTheme() }` (hook delegates provider to caller)', () => {
    const source = `
      import { useTheme } from '@pyreon/styler'
      export const useThemeValue = (path) => {
        const theme = useTheme()
        return theme?.[path]
      }
    `
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-theme-outside-provider')
    expect(diags.length).toBe(0)
  })

  it('still fires inside a non-hook arrow function calling useTheme', () => {
    const source = `
      import { useTheme } from '@pyreon/styler'
      export const getColor = () => useTheme()?.colors?.primary
    `
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-theme-outside-provider')
    expect(diags.length).toBeGreaterThanOrEqual(1)
  })
})

// `no-window-in-ssr` recognizes the const-captured typeof guard idiom:
// `const isBrowser = typeof window !== 'undefined'; if (isBrowser) { window.X }`.
describe('no-window-in-ssr: const-captured typeof guard', () => {
  it('silent under `if (isBrowser)` after `const isBrowser = typeof window !== "undefined"`', () => {
    const source = `
      const isBrowser = typeof window !== 'undefined'
      if (isBrowser) {
        window.addEventListener('online', () => {})
      }
    `
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-window-in-ssr')
    expect(diags.length).toBe(0)
  })

  it('still fires when the const is not a typeof check', () => {
    const source = `
      const isBrowser = true
      if (isBrowser) {
        window.addEventListener('online', () => {})
      }
    `
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-window-in-ssr')
    expect(diags.length).toBeGreaterThanOrEqual(1)
  })
})

// `no-window-in-ssr` precision improvements introduced alongside the hooks
// anti-pattern cleanup. Each block targets one of the silent-false-positive
// sources previously caused by oxc's visitor not passing `parent`.
describe('no-window-in-ssr: precision (oxc no-parent fixes)', () => {
  it('silent when `typeof X` is the expression itself (the mention of X is not a global ref)', () => {
    const source = `const t = typeof window`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent for member-expression property names (x.addEventListener)', () => {
    const source = `function f(x) { x.addEventListener('click', () => {}) }`
    const result = lintSource(source)
    // `addEventListener` is a property name, not a global — must not fire.
    // (`x` is also not a browser global.)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent for object-property keys ({ document: 1 })', () => {
    const source = `const o = { document: 1, window: 2 }`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent for import-specifier names', () => {
    const source = `import { window as w } from './foo'`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent for TS type-position identifiers (let x: Window)', () => {
    const source = `let x: Window | null = null`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent under early-return-on-typeof guard', () => {
    const source = `
      function load() {
        if (typeof window === 'undefined') return
        window.addEventListener('online', () => {})
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent under OR-chained early-return-on-typeof guard', () => {
    const source = `
      function load() {
        if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return
        const o = new IntersectionObserver(() => {})
        window.addEventListener('online', () => {})
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent inside onUnmount / onCleanup / renderEffect', () => {
    const source = `
      onUnmount(() => { window.removeEventListener('x', () => {}) })
      onCleanup(() => { document.body.style.overflow = '' })
      renderEffect(() => { const w = window.innerWidth })
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent in ternary consequent of typeof check', () => {
    const source = `const w = typeof window !== 'undefined' ? window.innerWidth : 0`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('still fires for the negated form body (safety check on testIsTypeofGuard split)', () => {
    // `if (typeof window === 'undefined') { window.X }` — the body is the
    // SSR-fallback branch, NOT a browser-safe zone. Must fire.
    const source = `
      if (typeof window === 'undefined') {
        const w = window.innerWidth
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBeGreaterThanOrEqual(1)
  })
})

// Additional precision: `IS_BROWSER && active()` as ternary/if test — the
// LogicalAnd short-circuits so the body only runs when the typeof-derived
// const is truthy. Common pattern in Portal/Overlay conditional rendering.
describe('no-window-in-ssr: logical-and guards with typeof-derived const', () => {
  it('silent under `IS_BROWSER && cond()` ternary test', () => {
    const source = `
      const IS_BROWSER = typeof window !== 'undefined'
      const vnode = IS_BROWSER && cond() ? document.body : null
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent under `cond() && IS_BROWSER` ternary test (either side)', () => {
    const source = `
      const IS_BROWSER = typeof window !== 'undefined'
      const vnode = cond() && IS_BROWSER ? document.body : null
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('fires when neither side is a typeof guard', () => {
    const source = `
      const vnode = flag && cond() ? document.body : null
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBeGreaterThanOrEqual(1)
  })
})

// The `render` VNode-producing helper from `@pyreon/ui-core` takes a
// ComponentFn/string/VNode and returns a VNodeChild — its call sites in JSX
// always produce a VNode, not a signal value. Exempted from the bare-signal
// heuristic.
describe('no-bare-signal-in-jsx: render() helper exemption', () => {
  it('silent for render(content, props) in JSX text', () => {
    const source = `const App = () => <div>{render(own.trigger, { active: true })}</div>`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-bare-signal-in-jsx').length).toBe(0)
  })

  it('still fires for other bare identifiers in JSX text', () => {
    const source = `const App = () => <div>{count()}</div>`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-bare-signal-in-jsx').length).toBeGreaterThanOrEqual(1)
  })

  it('silent for h() hyperscript in JSX text (VNode-producing helper)', () => {
    const source = `const App = () => <Show>{h('span', null, 'y')}</Show>`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-bare-signal-in-jsx').length).toBe(0)
  })

  it('silent for cloneVNode() in JSX text (VNode-producing helper)', () => {
    const source = `const App = (props) => <Show>{cloneVNode(props.children, { ref: r })}</Show>`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-bare-signal-in-jsx').length).toBe(0)
  })
})

// `no-window-in-ssr` — `watch()` from @pyreon/reactivity and
// `requestAnimationFrame` are safe contexts: their callbacks only fire
// after initial setup / inside a browser frame. watch is handled
// precisely: only the 2nd arg (callback) is safe, the 1st (source) is
// evaluated at setup and stays under normal analysis.
describe('no-window-in-ssr: watch() and requestAnimationFrame safe contexts', () => {
  it('silent in the callback arg of watch(source, callback)', () => {
    const source = `
      watch(() => stage(), (s) => {
        cancelAnimationFrame(frameId)
      })
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('FIRES for browser globals in the SOURCE arg of watch (setup-time)', () => {
    // The source arg runs at setup to track signals — browser globals there
    // would break SSR. Only the 2nd-arg callback is deferred.
    const source = `
      watch(() => window.innerWidth, (w) => {})
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBeGreaterThanOrEqual(1)
  })

  it('silent inside requestAnimationFrame callback', () => {
    const source = `
      requestAnimationFrame(() => {
        const w = window.innerWidth
      })
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })
})

// `no-window-in-ssr` — parameter-shadowing and typeof-derived const via
// logical-and chains. Driven by false-positives surfaced in @pyreon/router.
describe('no-window-in-ssr: parameter shadowing + typeof-derived AND chains', () => {
  it('silent when a function parameter named `location` shadows the global', () => {
    const source = `
      function push(location) {
        if (typeof location === 'string') return location.toUpperCase()
        return JSON.stringify(location)
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('still fires when the global is used in a sibling scope without shadowing', () => {
    const source = `
      function push(location) { return location }
      const hostname = window.location.hostname
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBeGreaterThanOrEqual(1)
  })

  it('silent under `if (useVT)` when useVT binds from `_isBrowser && ... && typeof X === "function"`', () => {
    const source = `
      const _isBrowser = typeof window !== 'undefined'
      const useVT = _isBrowser && meta && typeof document.startViewTransition === 'function'
      if (useVT) {
        document.startViewTransition(() => {})
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent for destructured parameter named `location`', () => {
    const source = `
      function route({ location, path }) { return location + path }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent under `if (handler)` when handler is bound via `_isBrowser ? fn : null`', () => {
    // Ternary-derived bindings: `handler` is only non-null when the guard
    // was truthy, so `if (handler)` implicitly asserts the guard held.
    const source = `
      const _isBrowser = typeof window !== 'undefined'
      const handler = _isBrowser ? (e) => e.preventDefault() : null
      if (handler) {
        window.addEventListener('beforeunload', handler)
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })

  it('silent under `if (h)` when h is bound via `_isBrowser && mode === X ? fn : null`', () => {
    const source = `
      const _isBrowser = typeof window !== 'undefined'
      const h = _isBrowser && mode === 'history' ? () => {} : null
      if (h) { window.addEventListener('popstate', h) }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
  })
})

// `no-imperative-navigate-in-render` — navigate calls inside nested
// functions (event handlers, effect callbacks, ref callbacks) are deferred
// execution and must not be flagged.
describe('no-imperative-navigate-in-render: deferred-execution callbacks', () => {
  it('silent when router.push is inside an event handler assigned to a local const', () => {
    const source = `
      const RouterLink = (props) => {
        const handleClick = (e) => {
          router.push(props.to)
        }
        return <a onClick={handleClick} />
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-imperative-navigate-in-render').length).toBe(0)
  })

  it('silent when navigate is inside a setTimeout callback', () => {
    const source = `
      const Comp = (props) => {
        setTimeout(() => { navigate('/home') }, 100)
        return <div />
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-imperative-navigate-in-render').length).toBe(0)
  })

  it('still fires for router.push directly in component body', () => {
    const source = `
      const Comp = (props) => {
        router.push('/elsewhere')
        return <div />
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-imperative-navigate-in-render').length).toBeGreaterThanOrEqual(1)
  })

  it('fires when a nested fn is DEFINED and immediately CALLED in the render body', () => {
    // `const fn = () => router.push(); fn()` — the navigate runs synchronously
    // on every render (same infinite-loop bug as a direct call).
    const source = `
      const Comp = (props) => {
        const goHome = () => router.push('/home')
        goHome()
        return <div />
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-imperative-navigate-in-render').length).toBeGreaterThanOrEqual(1)
  })

  it('silent when a nested fn containing navigate is defined but NOT called synchronously', () => {
    // Defined-and-stored pattern — the navigate never runs during render.
    const source = `
      const Comp = (props) => {
        const goHome = () => navigate('/home')
        return <a onClick={goHome} />
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-imperative-navigate-in-render').length).toBe(0)
  })
})

// `no-dom-in-setup` — recognises `requestAnimationFrame`, `onUnmount`,
// `onCleanup`, `renderEffect` as safe contexts (post-mount browser only).
describe('no-dom-in-setup: expanded safe-context set', () => {
  it('silent inside requestAnimationFrame callback', () => {
    const source = `
      requestAnimationFrame(() => {
        const el = document.getElementById('x')
      })
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-dom-in-setup').length).toBe(0)
  })

  it('silent inside onCleanup / onUnmount / renderEffect', () => {
    const source = `
      onCleanup(() => { document.querySelector('.x') })
      onUnmount(() => { document.getElementById('y') })
      renderEffect(() => { document.getElementsByClassName('z') })
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/no-dom-in-setup').length).toBe(0)
  })
})

// `dev-guard-warnings` — conventional name-based flag recognition. The rule
// can't follow cross-module imports to verify a binding really resolves to
// `import.meta.env.DEV`, so well-known dev-flag identifiers (`__DEV__`,
// `IS_DEV`, `IS_DEVELOPMENT`, `isDev`) are recognised by name.
describe('dev-guard-warnings: dev-flag identifier conventions', () => {
  it('silent under `if (!IS_DEVELOPMENT) return` early-return guard', () => {
    const source = `
      function devWarn(msg) {
        if (!IS_DEVELOPMENT) return
        console.warn(msg)
      }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/dev-guard-warnings').length).toBe(0)
  })

  it('silent under `IS_DEV && console.warn(...)` logical-and guard', () => {
    const source = `IS_DEV && console.warn('hello')`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/dev-guard-warnings').length).toBe(0)
  })

  it('still fires without any guard', () => {
    const source = `console.warn('no guard')`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/dev-guard-warnings').length).toBeGreaterThanOrEqual(1)
  })

  it('silent under locally-bound dev flag: `const D = import.meta.env.DEV === true; if (D) { console.warn(…) }`', () => {
    const source = `
      const D = import.meta.env.DEV === true
      if (D) { console.warn('boom') }
    `
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/dev-guard-warnings').length).toBe(0)
  })

  it('user-supplied `devFlagNames` extends the default set', () => {
    const source = `
      if (__DEBUG__) { console.warn('hello') }
      // Built-ins still work:
      if (__DEV__) { console.warn('world') }
    `
    const base = getPreset('recommended')
    const existing = base.rules['pyreon/dev-guard-warnings']
    const severity = Array.isArray(existing) ? existing[0] : existing
    const cfg: LintConfig = {
      ...base,
      rules: {
        ...base.rules,
        'pyreon/dev-guard-warnings': [severity as 'error', { devFlagNames: ['__DEBUG__'] }],
      },
    }
    const result = lintFile('src/foo.ts', source, allRules, cfg)
    expect(findByRule(result, 'pyreon/dev-guard-warnings').length).toBe(0)
  })

  it('unknown identifier does NOT act as a guard (negative case)', () => {
    const source = `if (random_flag) { console.warn('hi') }`
    const result = lintSource(source)
    expect(findByRule(result, 'pyreon/dev-guard-warnings').length).toBeGreaterThanOrEqual(1)
  })
})

// ── Test-file heuristic (C-rules) ────────────────────────────────────────────
//
// Three rules can't distinguish "intentional test stub" from "real production
// usage" purely from the AST (the rule's premise is intent-dependent: did
// you forget validation, did you mean to duplicate this id, did you mean
// to leave the field unregistered). For these we keep an explicit test-file
// heuristic and document it as such — a `// pyreon-lint-disable-next-line`
// is the right tool for intentional exceptions in production code.
//
// `no-circular-import` also keeps file-path skip but for a different reason —
// tests don't ship as part of the layered production dep graph, so the
// layer-order discipline genuinely doesn't apply to them. Categorical, not
// a heuristic.

describe('test-file heuristic (rules that intentionally skip *.test.* files)', () => {
  const cases: Array<[string, string, string]> = [
    ['pyreon/no-submit-without-validation', 'src/tests/form.test.tsx', `useForm({ onSubmit: () => {} })`],
    ['pyreon/no-duplicate-store-id', 'src/tests/store.test.ts', `defineStore('a', () => {}); defineStore('a', () => {})`],
    ['pyreon/no-unregistered-field', 'src/tests/form.test.ts', `const f = useField(form, 'x')`],
    ['pyreon/no-circular-import', 'packages/core/runtime-dom/src/tests/integration.test.ts', `import { renderToString } from '@pyreon/runtime-server'`],
  ]

  for (const [rule, filePath, source] of cases) {
    it(`${rule}: exempt in ${filePath}`, () => {
      const result = lintFile(filePath, source, allRules, defaultConfig())
      const diags = findByRule(result, rule)
      expect(diags.length).toBe(0)
    })
  }
})

// ── Rule options schema validation ───────────────────────────────────────────

describe('rule options schema', () => {
  beforeEach(async () => {
    const { _resetConfigDiagnosticsCache } = await import('../runner')
    _resetConfigDiagnosticsCache()
  })

  it('wrong-typed option disables the rule + surfaces a config diagnostic', () => {
    // `exemptPaths` declared as string[]; user passes a string. Cast via
    // JSON.parse so we exercise the runtime validator (TypeScript would
    // otherwise reject the literal at compile time).
    const badOptions = JSON.parse(
      `{"exemptPaths":"packages/core/runtime-dom/"}`,
    ) as Record<string, unknown>
    const cfg: LintConfig = {
      rules: { 'pyreon/no-window-in-ssr': ['error', badOptions] },
    }
    const source = `const w = window.innerWidth`
    const sink: ConfigDiagnostic[] = []
    const result = lintFile(
      'packages/core/runtime-dom/src/foo.ts',
      source,
      allRules,
      cfg,
      undefined,
      sink,
    )
    // Rule disabled → no file diagnostic for this rule (even though the
    // source WOULD trip it with a valid config).
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
    // Config diagnostic surfaces in the sink (not just stderr).
    expect(sink.some((d) => d.severity === 'error' && d.message.includes('must be string[]'))).toBe(
      true,
    )
  })

  it('unknown option surfaces a warning diagnostic but keeps the rule enabled', () => {
    const cfg: LintConfig = {
      rules: {
        'pyreon/no-window-in-ssr': [
          'error',
          { typo: 'oops', exemptPaths: ['packages/core/runtime-dom/'] },
        ],
      },
    }
    const source = `const w = window.innerWidth`
    const sink: ConfigDiagnostic[] = []
    const result = lintFile(
      'packages/core/runtime-dom/src/foo.ts',
      source,
      allRules,
      cfg,
      undefined,
      sink,
    )
    // Rule still works (real exemptPaths still applied).
    expect(findByRule(result, 'pyreon/no-window-in-ssr').length).toBe(0)
    // Warning surfaces.
    expect(sink.some((d) => d.severity === 'warn' && d.message.includes('unknown option "typo"'))).toBe(
      true,
    )
  })

  it('schema-less rules accept any options without validation diagnostics', () => {
    // `no-map-in-jsx` has no schema — options pass through.
    const cfg: LintConfig = {
      rules: { 'pyreon/no-map-in-jsx': ['warn', { whatever: [1, 2, 3] }] },
    }
    const source = `const X = () => <div>{items.map(i => <span>{i}</span>)}</div>`
    const sink: ConfigDiagnostic[] = []
    const result = lintFile('src/Foo.tsx', source, allRules, cfg, undefined, sink)
    expect(findByRule(result, 'pyreon/no-map-in-jsx').length).toBeGreaterThanOrEqual(1)
    expect(sink.length).toBe(0)
  })

  it('config diagnostics flow through `lint()` to LintResult.configDiagnostics', async () => {
    // End-to-end: `lint()` on a tmp dir with bad config → result has the diagnostic.
    const { tmpdir } = await import('node:os')
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-lint-cfg-bad-'))
    try {
      writeFileSync(join(dir, '.pyreonlintrc.json'), JSON.stringify({
        preset: 'recommended',
        rules: { 'pyreon/no-window-in-ssr': ['error', { exemptPaths: 'oops-not-array' }] },
      }))
      writeFileSync(join(dir, 'foo.ts'), `const w = window.innerWidth`)

      const { lint } = await import('../lint')
      const result = lint({ paths: [dir], config: join(dir, '.pyreonlintrc.json') })
      expect(result.configDiagnostics.length).toBeGreaterThanOrEqual(1)
      expect(result.configDiagnostics.some((d) => d.message.includes('must be string[]'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── CLI --rule-options parser ────────────────────────────────────────────────

describe('parseRuleOptionsOverride (CLI flag parser)', () => {
  let parser: typeof import('../cli').parseRuleOptionsOverride
  beforeAll(async () => {
    parser = (await import('../cli')).parseRuleOptionsOverride
  })

  it('parses valid `id={"key":[...]}` payload', () => {
    const sink: Record<string, Record<string, unknown>> = {}
    parser(`pyreon/no-window-in-ssr={"exemptPaths":["src/foundation/"]}`, sink)
    expect(sink['pyreon/no-window-in-ssr']).toEqual({ exemptPaths: ['src/foundation/'] })
  })

  it('rejects malformed JSON (logs to stderr, leaves sink untouched)', () => {
    const errs: string[] = []
    const orig = console.error
    console.error = (...a: unknown[]) => errs.push(a.map(String).join(' '))
    try {
      const sink: Record<string, Record<string, unknown>> = {}
      parser(`pyreon/foo={not json}`, sink)
      expect(Object.keys(sink).length).toBe(0)
      expect(errs.some((e) => e.includes('invalid JSON'))).toBe(true)
    } finally {
      console.error = orig
    }
  })

  it('rejects non-object JSON payload (e.g. an array)', () => {
    const errs: string[] = []
    const orig = console.error
    console.error = (...a: unknown[]) => errs.push(a.map(String).join(' '))
    try {
      const sink: Record<string, Record<string, unknown>> = {}
      parser(`pyreon/foo=[1,2,3]`, sink)
      expect(Object.keys(sink).length).toBe(0)
      expect(errs.some((e) => e.includes('expected JSON object'))).toBe(true)
    } finally {
      console.error = orig
    }
  })

  it('ignores empty value', () => {
    const sink: Record<string, Record<string, unknown>> = {}
    parser(undefined, sink)
    parser('', sink)
    expect(Object.keys(sink).length).toBe(0)
  })

  it('ignores value missing the `=` separator', () => {
    const sink: Record<string, Record<string, unknown>> = {}
    parser('pyreon/foo-no-eq', sink)
    expect(Object.keys(sink).length).toBe(0)
  })

  it('preserves rule IDs that contain `=` after the first separator', () => {
    const sink: Record<string, Record<string, unknown>> = {}
    parser(`pyreon/x={"foo":"a=b=c"}`, sink)
    expect(sink['pyreon/x']).toEqual({ foo: 'a=b=c' })
  })
})

// ── CLI ruleOptionsOverrides → lint() integration ───────────────────────────

describe('lint() ruleOptionsOverrides (CLI --rule-options pathway)', () => {
  it('CLI options override merge on top of file-config options', async () => {
    const { tmpdir } = await import('node:os')
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-lint-cli-opts-'))
    try {
      // No rc file — just CLI override.
      writeFileSync(join(dir, 'foo.tsx'), `const w = window.innerWidth`)
      const { lint } = await import('../lint')

      // Without override → rule fires.
      const before = lint({ paths: [dir] })
      const beforeCount = before.files.flatMap((f) => f.diagnostics)
        .filter((d) => d.ruleId === 'pyreon/no-window-in-ssr').length
      expect(beforeCount).toBeGreaterThanOrEqual(1)

      // With CLI override exempting the dir → rule silent.
      const after = lint({
        paths: [dir],
        ruleOptionsOverrides: {
          'pyreon/no-window-in-ssr': { exemptPaths: [dir] },
        },
      })
      const afterCount = after.files.flatMap((f) => f.diagnostics)
        .filter((d) => d.ruleId === 'pyreon/no-window-in-ssr').length
      expect(afterCount).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── /examples/ regression assertion ─────────────────────────────────────────
//
// This PR moves the `/examples/` skip out of `dev-guard-warnings` rule source
// (Pyreon convention, not universal) and into the monorepo's own
// `.pyreonlintrc.json`. Without that config, the rule now fires inside
// `/examples/`. This test pins that behavior change so future readers see
// it intentionally regressed for users who relied on the implicit skip.

describe('dev-guard-warnings: /examples/ skip moved to config', () => {
  it('fires in /examples/ when no exemptPaths are configured', () => {
    const source = `console.warn("oops")`
    const result = lintFile(
      'examples/my-app/src/index.tsx',
      source,
      allRules,
      defaultConfig(),
    )
    expect(findByRule(result, 'pyreon/dev-guard-warnings').length).toBeGreaterThanOrEqual(1)
  })

  it('silent in /examples/ when configured via exemptPaths', () => {
    const source = `console.warn("oops")`
    const cfg = configWithExemptPaths('pyreon/dev-guard-warnings', ['examples/'])
    const result = lintFile('examples/my-app/src/index.tsx', source, allRules, cfg)
    expect(findByRule(result, 'pyreon/dev-guard-warnings').length).toBe(0)
  })
})

// ── End-to-end: .pyreonlintrc.json round-trip ────────────────────────────────

describe('config-file round-trip', () => {
  it('loads tuple-form rule entries from .pyreonlintrc.json and applies exemptPaths', async () => {
    const { tmpdir } = await import('node:os')
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-lint-cfg-'))
    try {
      // Write a config that uses the tuple form.
      writeFileSync(
        join(dir, '.pyreonlintrc.json'),
        JSON.stringify({
          preset: 'recommended',
          rules: {
            'pyreon/no-window-in-ssr': ['error', { exemptPaths: ['src/foundation/'] }],
          },
        }),
      )

      const { loadConfig } = await import('../config/loader')
      const loaded = loadConfig(dir)
      expect(loaded).toBeTruthy()
      expect(loaded?.rules?.['pyreon/no-window-in-ssr']).toBeInstanceOf(Array)

      // Build a runtime config from the loaded file + exercise the rule.
      const base = getPreset('recommended')
      const runtimeCfg: LintConfig = {
        ...base,
        rules: { ...base.rules, ...(loaded?.rules ?? {}) },
      }

      // In an exempt path — rule silent.
      const exempt = lintFile(
        'src/foundation/raw-window.ts',
        `const w = window.innerWidth`,
        allRules,
        runtimeCfg,
      )
      expect(findByRule(exempt, 'pyreon/no-window-in-ssr').length).toBe(0)

      // Outside the exempt path — rule fires.
      const fires = lintFile(
        'src/components/Hero.tsx',
        `const w = window.innerWidth`,
        allRules,
        runtimeCfg,
      )
      expect(findByRule(fires, 'pyreon/no-window-in-ssr').length).toBeGreaterThanOrEqual(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── pyreon/require-browser-smoke-test ─────────────────────────────────────
//
// Locks in the durability of the T1.1 browser smoke harness. Without this
// rule, any new browser-running package can quietly ship without smoke
// coverage and we drift back to the world before T1.1.

describe('pyreon/require-browser-smoke-test', () => {
  // Helpers shared by the suite — set up a fake MONOREPO with a
  // `.claude/rules/browser-packages.json` at the root and a fake
  // package under `packages/<name>/`. The rule discovers the JSON by
  // walking upward from the linted file, so we mirror that structure.
  async function setupFakePackage(opts: {
    pkgName: string
    withBrowserTest: boolean
    browserPackagesOverride?: string[]
  }): Promise<{ rootDir: string; indexPath: string; pkgDir: string; cleanup: () => void }> {
    const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const rule = await import('../rules/architecture/require-browser-smoke-test')

    // Reset the module-level cache so earlier tests' JSON doesn't leak in.
    rule._resetBrowserPackagesCache()

    const rootDir = mkdtempSync(join(tmpdir(), 'pyreon-require-browser-smoke-'))
    mkdirSync(join(rootDir, '.claude', 'rules'), { recursive: true })
    const packages = opts.browserPackagesOverride ?? [
      '@pyreon/runtime-dom',
      '@pyreon/router',
      '@pyreon/head',
      '@pyreon/flow',
      '@pyreon/code',
      '@pyreon/charts',
      '@pyreon/document-primitives',
      '@pyreon/connector-document',
      '@pyreon/elements',
      '@pyreon/styler',
      '@pyreon/unistyle',
      '@pyreon/rocketstyle',
      '@pyreon/coolgrid',
      '@pyreon/kinetic',
      '@pyreon/ui-components',
      '@pyreon/ui-primitives',
      '@pyreon/ui-theme',
      '@pyreon/react-compat',
      '@pyreon/preact-compat',
      '@pyreon/vue-compat',
      '@pyreon/solid-compat',
    ]
    writeFileSync(
      join(rootDir, '.claude', 'rules', 'browser-packages.json'),
      JSON.stringify({ packages }),
    )

    const pkgDir = join(rootDir, 'packages', opts.pkgName.replace('@pyreon/', ''))
    mkdirSync(join(pkgDir, 'src'), { recursive: true })
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: opts.pkgName, version: '0.0.0' }),
    )
    const indexPath = join(pkgDir, 'src', 'index.ts')
    writeFileSync(indexPath, `export const x = 1\n`)
    if (opts.withBrowserTest) {
      writeFileSync(
        join(pkgDir, 'src', 'mount.browser.test.ts'),
        `import { it } from 'vitest'; it('ok', () => {})\n`,
      )
    }
    return {
      rootDir,
      pkgDir,
      indexPath,
      cleanup: () => {
        rule._resetBrowserPackagesCache()
        rmSync(rootDir, { recursive: true, force: true })
      },
    }
  }

  it('reports an error when a browser package ships no .browser.test.* file', async () => {
    const fake = await setupFakePackage({
      pkgName: '@pyreon/runtime-dom', // a real browser package name
      withBrowserTest: false,
    })
    try {
      const result = lintWith(
        'pyreon/require-browser-smoke-test',
        `export const x = 1`,
        fake.indexPath,
      )
      const diags = findByRule(result, 'pyreon/require-browser-smoke-test')
      expect(diags.length).toBe(1)
      expect(diags[0]?.message).toMatch(/no `\*\.browser\.test/)
      expect(diags[0]?.message).toMatch(/@pyreon\/runtime-dom/)
    } finally {
      fake.cleanup()
    }
  })

  it('passes when the package has at least one .browser.test.ts file', async () => {
    const fake = await setupFakePackage({
      pkgName: '@pyreon/runtime-dom',
      withBrowserTest: true,
    })
    try {
      const result = lintWith(
        'pyreon/require-browser-smoke-test',
        `export const x = 1`,
        fake.indexPath,
      )
      expect(findByRule(result, 'pyreon/require-browser-smoke-test').length).toBe(0)
    } finally {
      fake.cleanup()
    }
  })

  it('skips packages not in the browser-categorized list', async () => {
    const fake = await setupFakePackage({
      pkgName: '@pyreon/server', // server-only, not categorized
      withBrowserTest: false,
    })
    try {
      const result = lintWith(
        'pyreon/require-browser-smoke-test',
        `export const x = 1`,
        fake.indexPath,
      )
      expect(findByRule(result, 'pyreon/require-browser-smoke-test').length).toBe(0)
    } finally {
      fake.cleanup()
    }
  })

  it('runs only on src/index.ts — internal files are skipped', async () => {
    const fake = await setupFakePackage({
      pkgName: '@pyreon/runtime-dom',
      withBrowserTest: false,
    })
    try {
      const { writeFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      const internalPath = join(fake.pkgDir, 'src', 'internal.ts')
      writeFileSync(internalPath, `export const y = 2\n`)
      const result = lintWith(
        'pyreon/require-browser-smoke-test',
        `export const y = 2`,
        internalPath,
      )
      // Internal file → no report (rule short-circuits).
      expect(findByRule(result, 'pyreon/require-browser-smoke-test').length).toBe(0)
    } finally {
      fake.cleanup()
    }
  })

  it('additionalPackages option opts new packages into the requirement', async () => {
    const fake = await setupFakePackage({
      pkgName: '@my-org/my-browser-pkg', // not in the default list
      withBrowserTest: false,
    })
    try {
      const cfg: LintConfig = {
        rules: {
          'pyreon/require-browser-smoke-test': [
            'error',
            { additionalPackages: ['@my-org/my-browser-pkg'] },
          ],
        },
      }
      const result = lintFile(
        fake.indexPath,
        `export const x = 1`,
        allRules,
        cfg,
      )
      expect(findByRule(result, 'pyreon/require-browser-smoke-test').length).toBe(1)
    } finally {
      fake.cleanup()
    }
  })

  it('exemptPaths option opts packages out of the requirement', async () => {
    const fake = await setupFakePackage({
      pkgName: '@pyreon/runtime-dom',
      withBrowserTest: false,
    })
    try {
      const cfg: LintConfig = {
        rules: {
          'pyreon/require-browser-smoke-test': [
            'error',
            { exemptPaths: [fake.pkgDir] },
          ],
        },
      }
      const result = lintFile(
        fake.indexPath,
        `export const x = 1`,
        allRules,
        cfg,
      )
      expect(findByRule(result, 'pyreon/require-browser-smoke-test').length).toBe(0)
    } finally {
      fake.cleanup()
    }
  })

  // ── Edge cases for the directory walker + single-source-of-truth ──────

  it('finds a .browser.test.tsx file (not just .ts extension)', async () => {
    const fake = await setupFakePackage({
      pkgName: '@pyreon/runtime-dom',
      withBrowserTest: false,
    })
    try {
      const { writeFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      writeFileSync(
        join(fake.pkgDir, 'src', 'mount.browser.test.tsx'),
        `export {}`,
      )
      const result = lintWith(
        'pyreon/require-browser-smoke-test',
        `export const x = 1`,
        fake.indexPath,
      )
      expect(findByRule(result, 'pyreon/require-browser-smoke-test').length).toBe(0)
    } finally {
      fake.cleanup()
    }
  })

  it('finds a browser test nested deep inside src/', async () => {
    const fake = await setupFakePackage({
      pkgName: '@pyreon/runtime-dom',
      withBrowserTest: false,
    })
    try {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      const deep = join(fake.pkgDir, 'src', 'a', 'b', 'c', 'd')
      mkdirSync(deep, { recursive: true })
      writeFileSync(join(deep, 'nested.browser.test.ts'), `export {}`)
      const result = lintWith(
        'pyreon/require-browser-smoke-test',
        `export const x = 1`,
        fake.indexPath,
      )
      expect(findByRule(result, 'pyreon/require-browser-smoke-test').length).toBe(0)
    } finally {
      fake.cleanup()
    }
  })

  it('skips node_modules / lib / dist / dotfolders when scanning', async () => {
    // A package has NO real browser test but its node_modules contains
    // transitive browser tests (e.g. a dependency's dist). The rule must
    // not count those — they're not this package's contract.
    const fake = await setupFakePackage({
      pkgName: '@pyreon/runtime-dom',
      withBrowserTest: false,
    })
    try {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      const nm = join(fake.pkgDir, 'node_modules', 'some-dep', 'src')
      mkdirSync(nm, { recursive: true })
      writeFileSync(join(nm, 'fake.browser.test.ts'), `export {}`)
      const lib = join(fake.pkgDir, 'lib')
      mkdirSync(lib, { recursive: true })
      writeFileSync(join(lib, 'built.browser.test.ts'), `export {}`)
      const result = lintWith(
        'pyreon/require-browser-smoke-test',
        `export const x = 1`,
        fake.indexPath,
      )
      // Still reports missing — node_modules/lib contents don't count.
      expect(findByRule(result, 'pyreon/require-browser-smoke-test').length).toBe(1)
    } finally {
      fake.cleanup()
    }
  })

  it('falls back to empty list when browser-packages.json is absent (safe default)', async () => {
    // A consumer repo that uses @pyreon/lint but doesn't ship the JSON.
    // The rule should become a no-op (or only fire on explicit
    // additionalPackages) so it doesn't false-positive every index.ts.
    const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const rule = await import('../rules/architecture/require-browser-smoke-test')
    rule._resetBrowserPackagesCache()

    const rootDir = mkdtempSync(join(tmpdir(), 'pyreon-lint-no-json-'))
    try {
      const pkgDir = join(rootDir, 'packages', 'runtime-dom')
      mkdirSync(join(pkgDir, 'src'), { recursive: true })
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({ name: '@pyreon/runtime-dom' }),
      )
      const indexPath = join(pkgDir, 'src', 'index.ts')
      writeFileSync(indexPath, `export const x = 1`)
      const result = lintWith(
        'pyreon/require-browser-smoke-test',
        `export const x = 1`,
        indexPath,
      )
      // No JSON found → empty list → rule stays silent.
      expect(findByRule(result, 'pyreon/require-browser-smoke-test').length).toBe(0)
    } finally {
      rule._resetBrowserPackagesCache()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  it('malformed browser-packages.json falls back to empty (no crash, no false positives)', async () => {
    const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const rule = await import('../rules/architecture/require-browser-smoke-test')
    rule._resetBrowserPackagesCache()

    const rootDir = mkdtempSync(join(tmpdir(), 'pyreon-lint-bad-json-'))
    try {
      mkdirSync(join(rootDir, '.claude', 'rules'), { recursive: true })
      writeFileSync(
        join(rootDir, '.claude', 'rules', 'browser-packages.json'),
        `{ not valid json`,
      )
      const pkgDir = join(rootDir, 'packages', 'runtime-dom')
      mkdirSync(join(pkgDir, 'src'), { recursive: true })
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({ name: '@pyreon/runtime-dom' }),
      )
      const indexPath = join(pkgDir, 'src', 'index.ts')
      writeFileSync(indexPath, `export const x = 1`)
      const result = lintWith(
        'pyreon/require-browser-smoke-test',
        `export const x = 1`,
        indexPath,
      )
      // Parse failure → empty list → rule stays silent (no crash).
      expect(findByRule(result, 'pyreon/require-browser-smoke-test').length).toBe(0)
    } finally {
      rule._resetBrowserPackagesCache()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})

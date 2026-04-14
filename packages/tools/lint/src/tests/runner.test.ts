import { AstCache } from '../cache'
import { createIgnoreFilter } from '../config/ignore'
import { loadConfig } from '../config/loader'
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import { applyFixes, lintFile } from '../runner'
import type { LintConfig, Rule } from '../types'
import { LineIndex } from '../utils/source'

// Helper to create a config that enables all rules at default severity
function defaultConfig(): LintConfig {
  return getPreset('recommended')
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
  it('should have 58 rules', () => {
    expect(allRules.length).toBe(58)
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
    expect(counts.architecture).toBe(6)
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

  it('pyreon/no-window-in-ssr: exempt for runtime-dom (DOM renderer must touch DOM)', () => {
    const source = `const w = window.innerWidth; document.createElement('div')`
    const result = lintFile(
      'packages/core/runtime-dom/src/foo.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-window-in-ssr')
    expect(diags.length).toBe(0)
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

  it('pyreon/no-process-dev-gate: exempts server-only packages (Node always has process)', () => {
    const source = `const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`
    // packages/core/server/ is the SSR adapter — runs in Node, the pattern is correct there.
    const result = lintFile(
      'packages/core/server/src/handler.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-process-dev-gate')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-process-dev-gate: exempts runtime-server, zero, vite-plugin', () => {
    const source = `const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`
    for (const path of [
      'packages/core/runtime-server/src/index.ts',
      'packages/zero/zero/src/logger.ts',
      'packages/tools/vite-plugin/src/index.ts',
    ]) {
      const result = lintFile(path, source, allRules, defaultConfig())
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

  it('pyreon/no-mutate-store-state: flags store.signal.set()', () => {
    const result = lintWith('pyreon/no-mutate-store-state', `userStore.count.set(5)`)
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

  it('pyreon/no-raw-addeventlistener: exempt for runtime-dom (foundation of useEventListener)', () => {
    const source = `el.addEventListener("click", handler)`
    const result = lintFile(
      'packages/core/runtime-dom/src/delegate.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-raw-addeventlistener')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-raw-addeventlistener: exempt for @pyreon/hooks (implements the wrappers)', () => {
    const source = `el.addEventListener("click", handler)`
    const result = lintFile(
      'packages/fundamentals/hooks/src/useClickOutside.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-raw-addeventlistener')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-raw-setinterval: flags setInterval outside onMount', () => {
    const source = `setInterval(() => {}, 1000)`
    const result = lintSource(source)
    const diags = findByRule(result, 'pyreon/no-raw-setinterval')
    expect(diags.length).toBe(1)
  })

  it('pyreon/no-raw-setinterval: exempt for @pyreon/hooks (implements useInterval)', () => {
    const source = `setInterval(() => callback(), d)`
    const result = lintFile(
      'packages/fundamentals/hooks/src/useInterval.ts',
      source,
      allRules,
      defaultConfig(),
    )
    const diags = findByRule(result, 'pyreon/no-raw-setinterval')
    expect(diags.length).toBe(0)
  })

  it('pyreon/no-raw-localstorage: flags localStorage.getItem()', () => {
    const source = `const v = localStorage.getItem("key")`
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
    expect(Object.keys(config.rules).length).toBe(58)
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

// ── Test-file exemption ──────────────────────────────────────────────────────
//
// Eight rules target patterns tests legitimately exercise — duplicate store
// IDs to assert collision handling, raw `setInterval` for time-based test
// logic, mutating store state, etc. Each rule's `create()` early-returns
// when the file path matches `isTestFile()`, eliminating the noise that
// previously masked real signal in non-test code.

describe('test-file exemption (rules that intentionally skip *.test.* files)', () => {
  const cases: Array<[string, string, string]> = [
    ['pyreon/no-raw-setinterval', 'src/tests/timing.test.ts', `setInterval(() => {}, 100)`],
    ['pyreon/no-dynamic-styled', 'src/tests/styled.test.ts', `function f() { styled('div')\`color:red\` }`],
    ['pyreon/no-submit-without-validation', 'src/tests/form.test.tsx', `useForm({ onSubmit: () => {} })`],
    ['pyreon/no-raw-localstorage', 'src/tests/storage.test.ts', `localStorage.getItem('k')`],
    ['pyreon/no-duplicate-store-id', 'src/tests/store.test.ts', `defineStore('a', () => {}); defineStore('a', () => {})`],
    ['pyreon/no-unregistered-field', 'src/tests/form.test.ts', `const f = useField(form, 'x')`],
    ['pyreon/no-mutate-store-state', 'src/tests/store.test.ts', `store.count.set(5)`],
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

import { getPreset } from "../config/presets"
import { allRules } from "../rules/index"
import { applyFixes, lintFile } from "../runner"
import type { LintConfig, Rule } from "../types"
import { LineIndex } from "../utils/source"

// Helper to create a config that enables all rules at default severity
function defaultConfig(): LintConfig {
  return getPreset("recommended")
}

// Helper to lint a string with specific rules
function lintSource(
  source: string,
  rules?: Rule[],
  filePath?: string,
): ReturnType<typeof lintFile> {
  return lintFile(filePath ?? "test.tsx", source, rules ?? allRules, defaultConfig())
}

// Helper to find diagnostics by rule ID
function findByRule(result: ReturnType<typeof lintFile>, ruleId: string) {
  return result.diagnostics.filter((d) => d.ruleId === ruleId)
}

// ── Rule Metadata ───────────────────────────────────────────────────────────

describe("Rule metadata", () => {
  it("should have 51 rules", () => {
    expect(allRules.length).toBe(51)
  })

  it("should have unique rule IDs", () => {
    const ids = allRules.map((r) => r.meta.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it("all rule IDs should start with pyreon/", () => {
    for (const rule of allRules) {
      expect(rule.meta.id).toMatch(/^pyreon\//)
    }
  })

  it("all rules should have valid categories", () => {
    const validCategories = new Set([
      "reactivity",
      "jsx",
      "lifecycle",
      "performance",
      "ssr",
      "architecture",
      "store",
      "form",
      "styling",
      "hooks",
      "accessibility",
    ])
    for (const rule of allRules) {
      expect(validCategories.has(rule.meta.category)).toBe(true)
    }
  })

  it("should have correct category counts", () => {
    const counts: Record<string, number> = {}
    for (const rule of allRules) {
      counts[rule.meta.category] = (counts[rule.meta.category] ?? 0) + 1
    }
    expect(counts.reactivity).toBe(8)
    expect(counts.jsx).toBe(11)
    expect(counts.lifecycle).toBe(4)
    expect(counts.performance).toBe(4)
    expect(counts.ssr).toBe(3)
    expect(counts.architecture).toBe(5)
    expect(counts.store).toBe(3)
    expect(counts.form).toBe(3)
    expect(counts.styling).toBe(4)
    expect(counts.hooks).toBe(3)
    expect(counts.accessibility).toBe(3)
  })
})

// ── Runner Basics ───────────────────────────────────────────────────────────

describe("Runner", () => {
  it("should parse valid TypeScript/JSX", () => {
    const result = lintSource(`const x = 1`)
    expect(result.diagnostics).toBeDefined()
  })

  it("should skip non-JS files", () => {
    const result = lintFile("test.css", "body { color: red }", allRules, defaultConfig())
    expect(result.diagnostics.length).toBe(0)
  })

  it("should sort diagnostics by position", () => {
    const source = `
const a = signal(0)
const b = signal(0)
// These are just declared, not used
`
    const rule = allRules.find((r) => r.meta.id === "pyreon/no-signal-leak")
    if (!rule) throw new Error("Rule not found")
    const result = lintSource(source, [rule])
    if (result.diagnostics.length >= 2) {
      const first = result.diagnostics[0]
      const second = result.diagnostics[1]
      if (first && second) {
        expect(first.span.start).toBeLessThanOrEqual(second.span.start)
      }
    }
  })

  it("should apply fixes in reverse order", () => {
    const source = `<div className="a" htmlFor="b" />`
    const result = lintSource(source)
    const classnameDiags = findByRule(result, "pyreon/no-classname")
    const htmlforDiags = findByRule(result, "pyreon/no-htmlfor")

    // Both should be fixable
    expect(classnameDiags.length).toBeGreaterThanOrEqual(1)
    expect(htmlforDiags.length).toBeGreaterThanOrEqual(1)
    expect(classnameDiags[0]?.fix).toBeDefined()
    expect(htmlforDiags[0]?.fix).toBeDefined()

    const fixed = applyFixes(source, result.diagnostics)
    expect(fixed).toContain("class=")
    expect(fixed).toContain("for=")
    expect(fixed).not.toContain("className")
    expect(fixed).not.toContain("htmlFor")
  })
})

// ── Source Utilities ─────────────────────────────────────────────────────────

describe("LineIndex", () => {
  it("should compute line/column for single-line source", () => {
    const idx = new LineIndex("hello world")
    expect(idx.locate(0)).toEqual({ line: 1, column: 0 })
    expect(idx.locate(5)).toEqual({ line: 1, column: 5 })
  })

  it("should compute line/column for multi-line source", () => {
    const idx = new LineIndex("line1\nline2\nline3")
    expect(idx.locate(0)).toEqual({ line: 1, column: 0 })
    expect(idx.locate(6)).toEqual({ line: 2, column: 0 })
    expect(idx.locate(12)).toEqual({ line: 3, column: 0 })
    expect(idx.locate(8)).toEqual({ line: 2, column: 2 })
  })

  it("should handle empty source", () => {
    const idx = new LineIndex("")
    expect(idx.locate(0)).toEqual({ line: 1, column: 0 })
  })
})

// ── Reactivity Rules ────────────────────────────────────────────────────────

describe("Reactivity rules", () => {
  it("pyreon/no-bare-signal-in-jsx: flags {count()} in JSX", () => {
    const source = `const App = () => <div>{count()}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-bare-signal-in-jsx")
    expect(diags.length).toBe(1)
    expect(diags[0]?.fix).toBeDefined()
  })

  it("pyreon/no-bare-signal-in-jsx: skips PascalCase and use* calls", () => {
    const source = `const App = () => <div>{MyComponent()}{useTheme()}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-bare-signal-in-jsx")
    expect(diags.length).toBe(0)
  })

  it("pyreon/no-signal-in-loop: flags signal inside for loop", () => {
    const source = `for (let i = 0; i < 10; i++) { const s = signal(0) }`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-signal-in-loop")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-signal-in-loop: clean when outside loop", () => {
    const source = `const s = signal(0)`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-signal-in-loop")
    expect(diags.length).toBe(0)
  })

  it("pyreon/no-nested-effect: flags effect inside effect", () => {
    const source = `effect(() => { effect(() => {}) })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-nested-effect")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-peek-in-tracked: flags .peek() inside effect", () => {
    const source = `effect(() => { const v = x.peek() })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-peek-in-tracked")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-unbatched-updates: flags 3+ .set() without batch", () => {
    const source = `function update() { a.set(1); b.set(2); c.set(3) }`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-unbatched-updates")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-unbatched-updates: clean with batch", () => {
    const source = `function update() { batch(() => { a.set(1); b.set(2); c.set(3) }) }`
    const result = lintSource(source)
    // The outer function has batch, so no warning on it
    // The inner arrow gets checked too but has no .set() calls directly
    const diags = findByRule(result, "pyreon/no-unbatched-updates")
    expect(diags.length).toBe(0)
  })

  it("pyreon/prefer-computed: flags effect with single .set()", () => {
    const source = `effect(() => { x.set(a() + b()) })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/prefer-computed")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-effect-assignment: flags effect with single .update()", () => {
    const source = `effect(() => { x.update(v => v + 1) })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-effect-assignment")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-signal-leak: flags unused signal declarations", () => {
    const source = `const unused = signal(0)`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-signal-leak")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-signal-leak: clean when signal is used", () => {
    const source = `const count = signal(0)\nconst double = computed(() => count() * 2)`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-signal-leak")
    expect(diags.length).toBe(0)
  })
})

// ── JSX Rules ───────────────────────────────────────────────────────────────

describe("JSX rules", () => {
  it("pyreon/no-map-in-jsx: flags .map() in JSX", () => {
    const source = `const App = () => <ul>{items.map(i => <li>{i}</li>)}</ul>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-map-in-jsx")
    expect(diags.length).toBe(1)
  })

  it("pyreon/use-by-not-key: flags key on <For>", () => {
    const source = `const App = () => <For each={items} key={r => r.id}>{r => <li />}</For>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/use-by-not-key")
    expect(diags.length).toBe(1)
    expect(diags[0]?.fix).toBeDefined()
  })

  it("pyreon/no-classname: flags className and fixes to class", () => {
    const source = `const App = () => <div className="foo" />`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-classname")
    expect(diags.length).toBe(1)
    expect(diags[0]?.fix).toBeDefined()
  })

  it("pyreon/no-htmlfor: flags htmlFor and fixes to for", () => {
    const source = `const App = () => <label htmlFor="name" />`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-htmlfor")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-onchange: flags onChange on input", () => {
    const source = `const App = () => <input onChange={handler} />`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-onchange")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-onchange: clean on non-input elements", () => {
    const source = `const App = () => <div onChange={handler} />`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-onchange")
    expect(diags.length).toBe(0)
  })

  it("pyreon/no-ternary-conditional: flags ternary with JSX", () => {
    const source = `const App = () => <div>{flag ? <span>a</span> : <span>b</span>}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-ternary-conditional")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-and-conditional: flags && with JSX", () => {
    const source = `const App = () => <div>{flag && <span>yes</span>}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-and-conditional")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-missing-for-by: flags <For> without by", () => {
    const source = `const App = () => <For each={items}>{r => <li />}</For>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-missing-for-by")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-missing-for-by: clean when by is present", () => {
    const source = `const App = () => <For each={items} by={r => r.id}>{r => <li />}</For>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-missing-for-by")
    expect(diags.length).toBe(0)
  })

  it("pyreon/no-props-destructure: flags destructured props in component", () => {
    const source = `const App = ({ name }) => <div>{name}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-props-destructure")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-props-destructure: clean for non-component functions", () => {
    const source = `const fn = ({ a, b }) => a + b`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-props-destructure")
    expect(diags.length).toBe(0)
  })

  it("pyreon/no-index-as-by: flags by={(_, i) => i}", () => {
    const source = `const App = () => <For each={items} by={(_, i) => i}>{r => <li />}</For>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-index-as-by")
    expect(diags.length).toBe(1)
  })
})

// ── Lifecycle Rules ─────────────────────────────────────────────────────────

describe("Lifecycle rules", () => {
  it("pyreon/no-missing-cleanup: flags onMount with setInterval and no return", () => {
    const source = `onMount(() => { setInterval(() => {}, 1000) })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-missing-cleanup")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-missing-cleanup: clean when onMount returns cleanup", () => {
    const source = `onMount(() => { const id = setInterval(() => {}, 1000); return () => clearInterval(id) })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-missing-cleanup")
    expect(diags.length).toBe(0)
  })

  it("pyreon/no-mount-in-effect: flags onMount inside effect", () => {
    const source = `effect(() => { onMount(() => {}) })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-mount-in-effect")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-effect-in-mount: flags effect inside onMount", () => {
    const source = `onMount(() => { effect(() => {}) })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-effect-in-mount")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-dom-in-setup: flags document.querySelector outside onMount", () => {
    const source = `const el = document.querySelector(".app")`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-dom-in-setup")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-dom-in-setup: clean inside onMount", () => {
    const source = `onMount(() => { document.querySelector(".app") })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-dom-in-setup")
    expect(diags.length).toBe(0)
  })
})

// ── Performance Rules ───────────────────────────────────────────────────────

describe("Performance rules", () => {
  it("pyreon/no-eager-import: flags static import of heavy packages", () => {
    const source = `import { Chart } from "@pyreon/charts"`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-eager-import")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-eager-import: clean for lightweight packages", () => {
    const source = `import { signal } from "@pyreon/reactivity"`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-eager-import")
    expect(diags.length).toBe(0)
  })
})

// ── SSR Rules ───────────────────────────────────────────────────────────────

describe("SSR rules", () => {
  it("pyreon/no-window-in-ssr: flags window outside onMount", () => {
    const source = `const w = window.innerWidth`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-window-in-ssr")
    expect(diags.length).toBeGreaterThanOrEqual(1)
  })

  it("pyreon/no-window-in-ssr: clean inside onMount", () => {
    const source = `onMount(() => { const w = window.innerWidth })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-window-in-ssr")
    expect(diags.length).toBe(0)
  })

  it("pyreon/no-window-in-ssr: clean with typeof guard", () => {
    const source = `if (typeof window !== "undefined") { const w = window.innerWidth }`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-window-in-ssr")
    expect(diags.length).toBe(0)
  })

  it("pyreon/no-mismatch-risk: flags Date.now() in JSX", () => {
    const source = `const App = () => <div>{Date.now()}</div>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-mismatch-risk")
    expect(diags.length).toBe(1)
  })

  it("pyreon/prefer-request-context: flags module-level signal in server file", () => {
    const source = `const state = signal(0)`
    const result = lintFile("app.server.ts", source, allRules, defaultConfig())
    const diags = findByRule(result, "pyreon/prefer-request-context")
    expect(diags.length).toBe(1)
  })
})

// ── Architecture Rules ──────────────────────────────────────────────────────

describe("Architecture rules", () => {
  it("pyreon/no-deep-import: flags @pyreon/*/src/ imports", () => {
    const source = `import { something } from "@pyreon/core/src/signal"`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-deep-import")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-deep-import: clean for normal imports", () => {
    const source = `import { signal } from "@pyreon/reactivity"`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-deep-import")
    expect(diags.length).toBe(0)
  })

  it("pyreon/dev-guard-warnings: flags console.warn without __DEV__", () => {
    const source = `console.warn("something")`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/dev-guard-warnings")
    expect(diags.length).toBe(1)
  })

  it("pyreon/dev-guard-warnings: clean inside __DEV__ guard", () => {
    const source = `if (__DEV__) { console.warn("something") }`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/dev-guard-warnings")
    expect(diags.length).toBe(0)
  })

  it("pyreon/dev-guard-warnings: clean in test files", () => {
    const source = `console.warn("test warning")`
    const result = lintFile("src/tests/foo.test.ts", source, allRules, defaultConfig())
    const diags = findByRule(result, "pyreon/dev-guard-warnings")
    expect(diags.length).toBe(0)
  })

  it("pyreon/no-error-without-prefix: flags throw without [Pyreon]", () => {
    const source = `throw new Error("something went wrong")`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-error-without-prefix")
    expect(diags.length).toBe(1)
    expect(diags[0]?.fix).toBeDefined()
  })

  it("pyreon/no-error-without-prefix: clean with [Pyreon] prefix", () => {
    const source = `throw new Error("[Pyreon] something went wrong")`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-error-without-prefix")
    expect(diags.length).toBe(0)
  })
})

// ── Store Rules ─────────────────────────────────────────────────────────────

describe("Store rules", () => {
  it("pyreon/no-duplicate-store-id: flags duplicate IDs", () => {
    const source = `
defineStore("counter", () => {})
defineStore("counter", () => {})
`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-duplicate-store-id")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-duplicate-store-id: clean with unique IDs", () => {
    const source = `
defineStore("counter", () => {})
defineStore("user", () => {})
`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-duplicate-store-id")
    expect(diags.length).toBe(0)
  })
})

// ── Form Rules ──────────────────────────────────────────────────────────────

describe("Form rules", () => {
  it("pyreon/no-submit-without-validation: flags useForm with onSubmit but no validators", () => {
    const source = `const form = useForm({ initialValues: {}, onSubmit: () => {} })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-submit-without-validation")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-submit-without-validation: clean with validators", () => {
    const source = `const form = useForm({ initialValues: {}, onSubmit: () => {}, validators: {} })`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-submit-without-validation")
    expect(diags.length).toBe(0)
  })
})

// ── Styling Rules ───────────────────────────────────────────────────────────

describe("Styling rules", () => {
  it("pyreon/no-inline-style-object: flags style={{...}} in JSX", () => {
    const source = `const App = () => <div style={{ color: "red" }} />`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-inline-style-object")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-dynamic-styled: flags styled() inside function", () => {
    const source = `function App() { const Box = styled("div"); return null }`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-dynamic-styled")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-dynamic-styled: clean at module level", () => {
    const source = `const Box = styled("div")`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-dynamic-styled")
    expect(diags.length).toBe(0)
  })
})

// ── Hooks Rules ─────────────────────────────────────────────────────────────

describe("Hooks rules", () => {
  it("pyreon/no-raw-addeventlistener: flags .addEventListener()", () => {
    const source = `el.addEventListener("click", handler)`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-raw-addeventlistener")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-raw-setinterval: flags setInterval outside onMount", () => {
    const source = `setInterval(() => {}, 1000)`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-raw-setinterval")
    expect(diags.length).toBe(1)
  })

  it("pyreon/no-raw-localstorage: flags localStorage.getItem()", () => {
    const source = `const v = localStorage.getItem("key")`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/no-raw-localstorage")
    expect(diags.length).toBe(1)
  })
})

// ── Accessibility Rules ─────────────────────────────────────────────────────

describe("Accessibility rules", () => {
  it("pyreon/dialog-a11y: flags <dialog> without aria-label", () => {
    const source = `const App = () => <dialog><p>Hello</p></dialog>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/dialog-a11y")
    expect(diags.length).toBe(1)
  })

  it("pyreon/dialog-a11y: clean with aria-label", () => {
    const source = `const App = () => <dialog aria-label="My dialog"><p>Hello</p></dialog>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/dialog-a11y")
    expect(diags.length).toBe(0)
  })

  it("pyreon/overlay-a11y: flags <Overlay> without role", () => {
    const source = `const App = () => <Overlay><p>Hello</p></Overlay>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/overlay-a11y")
    expect(diags.length).toBe(1)
  })

  it("pyreon/overlay-a11y: clean with role", () => {
    const source = `const App = () => <Overlay role="dialog"><p>Hello</p></Overlay>`
    const result = lintSource(source)
    const diags = findByRule(result, "pyreon/overlay-a11y")
    expect(diags.length).toBe(0)
  })
})

// ── Presets ─────────────────────────────────────────────────────────────────

describe("Presets", () => {
  it("recommended should include all rules", () => {
    const config = getPreset("recommended")
    expect(Object.keys(config.rules).length).toBe(51)
  })

  it("strict should promote all warns to errors", () => {
    const recommended = getPreset("recommended")
    const strict = getPreset("strict")
    for (const [id, sev] of Object.entries(recommended.rules)) {
      if (sev === "warn") {
        expect(strict.rules[id]).toBe("error")
      }
    }
  })

  it("app should disable library-specific rules", () => {
    const app = getPreset("app")
    expect(app.rules["pyreon/dev-guard-warnings"]).toBe("off")
    expect(app.rules["pyreon/no-error-without-prefix"]).toBe("off")
    expect(app.rules["pyreon/no-circular-import"]).toBe("off")
    expect(app.rules["pyreon/no-cross-layer-import"]).toBe("off")
  })

  it("lib should have architecture rules as error", () => {
    const lib = getPreset("lib")
    expect(lib.rules["pyreon/no-circular-import"]).toBe("error")
    expect(lib.rules["pyreon/no-cross-layer-import"]).toBe("error")
    expect(lib.rules["pyreon/dev-guard-warnings"]).toBe("error")
  })
})

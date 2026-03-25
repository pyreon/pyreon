import { lintFile, applyFixes } from "../runner"
import { allRules } from "../rules"
import type { LintConfig, Rule } from "../types"

/** Helper to lint a string with specific rules */
function lintCode(code: string, rules: Rule[], filename = "test.tsx") {
  const config: LintConfig = {
    rules: Object.fromEntries(rules.map((r) => [r.meta.id, r.meta.defaultSeverity])),
  }
  return lintFile(filename, code, rules, config)
}

/** Helper to lint a string with all rules */
function lintAll(code: string, filename = "test.tsx") {
  return lintCode(code, allRules, filename)
}

/** Find a rule by ID */
function findRule(id: string): Rule {
  const rule = allRules.find((r) => r.meta.id === id)
  if (!rule) throw new Error(`Rule not found: ${id}`)
  return rule
}

/** Lint with a single rule */
function lintWith(ruleId: string, code: string, filename = "test.tsx") {
  return lintCode(code, [findRule(ruleId)], filename)
}

describe("runner", () => {
  it("parses valid TypeScript without errors", () => {
    const result = lintCode("const x: number = 1", [], "test.ts")
    expect(result.parseErrors).toHaveLength(0)
    expect(result.diagnostics).toHaveLength(0)
  })

  it("reports parse errors for invalid syntax", () => {
    const result = lintCode("const x = {{{", [], "test.ts")
    expect(result.parseErrors.length).toBeGreaterThan(0)
  })

  it("skips non-JS/TS files", () => {
    const result = lintCode("invalid code!", allRules, "test.css")
    expect(result.diagnostics).toHaveLength(0)
    expect(result.parseErrors).toHaveLength(0)
  })

  it("applies fixes correctly", () => {
    const source = '<div className="foo" />'
    const result = lintWith("pyreon/no-classname", source)
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].fix).toBeDefined()

    const fixed = applyFixes(source, result.diagnostics)
    expect(fixed).toContain("class")
    expect(fixed).not.toContain("className")
  })

  it("sorts diagnostics by position", () => {
    const code = `
      <div className="a" htmlFor="b" />
    `
    const result = lintCode(code, [findRule("pyreon/no-classname"), findRule("pyreon/no-htmlfor")])
    if (result.diagnostics.length >= 2) {
      expect(result.diagnostics[0].span.start).toBeLessThanOrEqual(result.diagnostics[1].span.start)
    }
  })
})

describe("reactivity rules", () => {
  describe("no-bare-signal-in-jsx", () => {
    it("flags bare signal calls in JSX", () => {
      const result = lintWith(
        "pyreon/no-bare-signal-in-jsx",
        "const App = () => <div>{count()}</div>",
      )
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0].message).toContain("count()")
    })

    it("ignores wrapped signal calls", () => {
      const result = lintWith(
        "pyreon/no-bare-signal-in-jsx",
        "const App = () => <div>{() => count()}</div>",
      )
      expect(result.diagnostics).toHaveLength(0)
    })

    it("ignores PascalCase (component calls)", () => {
      const result = lintWith(
        "pyreon/no-bare-signal-in-jsx",
        "const App = () => <div>{Header()}</div>",
      )
      expect(result.diagnostics).toHaveLength(0)
    })

    it("ignores getter-like names", () => {
      const result = lintWith(
        "pyreon/no-bare-signal-in-jsx",
        "const App = () => <div>{getCount()}</div>",
      )
      expect(result.diagnostics).toHaveLength(0)
    })

    it("provides auto-fix", () => {
      const result = lintWith(
        "pyreon/no-bare-signal-in-jsx",
        "const App = () => <div>{count()}</div>",
      )
      expect(result.diagnostics[0].fix).toBeDefined()
      expect(result.diagnostics[0].fix!.replacement).toBe("() => count()")
    })
  })

  describe("no-signal-in-loop", () => {
    it("flags signal() inside for loop", () => {
      const result = lintWith(
        "pyreon/no-signal-in-loop",
        "for (let i = 0; i < 10; i++) { signal(0) }",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("flags computed() inside while loop", () => {
      const result = lintWith(
        "pyreon/no-signal-in-loop",
        "while (true) { computed(() => 1) }",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows signal() outside loops", () => {
      const result = lintWith("pyreon/no-signal-in-loop", "const x = signal(0)")
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-nested-effect", () => {
    it("flags effect inside effect", () => {
      const result = lintWith(
        "pyreon/no-nested-effect",
        "effect(() => { effect(() => {}) })",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows sibling effects", () => {
      const result = lintWith(
        "pyreon/no-nested-effect",
        "effect(() => {}); effect(() => {})",
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-peek-in-tracked", () => {
    it("flags .peek() inside effect", () => {
      const result = lintWith(
        "pyreon/no-peek-in-tracked",
        "effect(() => { count.peek() })",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("flags .peek() inside computed", () => {
      const result = lintWith(
        "pyreon/no-peek-in-tracked",
        "computed(() => count.peek())",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows .peek() outside tracked contexts", () => {
      const result = lintWith(
        "pyreon/no-peek-in-tracked",
        "const x = count.peek()",
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-unbatched-updates", () => {
    it("flags 3+ .set() calls without batch", () => {
      const result = lintWith(
        "pyreon/no-unbatched-updates",
        "function update() { a.set(1); b.set(2); c.set(3) }",
      )
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0].message).toContain("3 signal")
    })

    it("allows batched updates", () => {
      const result = lintWith(
        "pyreon/no-unbatched-updates",
        "function update() { batch(() => { a.set(1); b.set(2); c.set(3) }) }",
      )
      expect(result.diagnostics).toHaveLength(0)
    })

    it("allows 2 or fewer .set() calls", () => {
      const result = lintWith(
        "pyreon/no-unbatched-updates",
        "function update() { a.set(1); b.set(2) }",
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("prefer-computed", () => {
    it("flags effect that only sets a signal (block body)", () => {
      const result = lintWith(
        "pyreon/prefer-computed",
        "effect(() => { total.set(a() + b()) })",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("flags effect with concise arrow body .set()", () => {
      const result = lintWith(
        "pyreon/prefer-computed",
        "effect(() => total.set(a() + b()))",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows effect with multiple statements", () => {
      const result = lintWith(
        "pyreon/prefer-computed",
        "effect(() => { console.log('hi'); total.set(a()) })",
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })
})

describe("jsx rules", () => {
  describe("no-classname", () => {
    it("flags className attribute", () => {
      const result = lintWith("pyreon/no-classname", '<div className="foo" />')
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0].fix!.replacement).toBe("class")
    })

    it("allows class attribute", () => {
      const result = lintWith("pyreon/no-classname", '<div class="foo" />')
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-htmlfor", () => {
    it("flags htmlFor attribute", () => {
      const result = lintWith("pyreon/no-htmlfor", '<label htmlFor="x" />')
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0].fix!.replacement).toBe("for")
    })
  })

  describe("use-by-not-key", () => {
    it("flags key prop on <For>", () => {
      const result = lintWith(
        "pyreon/use-by-not-key",
        "<For each={items} key={r => r.id}>{r => <li/>}</For>",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows by prop on <For>", () => {
      const result = lintWith(
        "pyreon/use-by-not-key",
        "<For each={items} by={r => r.id}>{r => <li/>}</For>",
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-map-in-jsx", () => {
    it("flags .map() inside JSX", () => {
      const result = lintWith(
        "pyreon/no-map-in-jsx",
        "const App = () => <ul>{items.map(i => <li>{i}</li>)}</ul>",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows .map() outside JSX", () => {
      const result = lintWith(
        "pyreon/no-map-in-jsx",
        "const arr = items.map(i => i + 1)",
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-onchange", () => {
    it("flags onChange on input", () => {
      const result = lintWith(
        "pyreon/no-onchange",
        "<input onChange={handler} />",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("ignores onChange on non-input elements", () => {
      const result = lintWith(
        "pyreon/no-onchange",
        "<div onChange={handler} />",
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-props-destructure", () => {
    it("flags destructured props in arrow component", () => {
      const result = lintWith(
        "pyreon/no-props-destructure",
        "const App = ({ name }) => <div>{name}</div>",
      )
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0].message).toContain("reactivity")
    })

    it("allows props object parameter", () => {
      const result = lintWith(
        "pyreon/no-props-destructure",
        "const App = (props) => <div>{props.name}</div>",
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-ternary-conditional", () => {
    it("flags ternary with JSX inside JSX", () => {
      const result = lintWith(
        "pyreon/no-ternary-conditional",
        "const App = () => <div>{isOpen ? <Modal/> : null}</div>",
      )
      expect(result.diagnostics).toHaveLength(1)
    })
  })

  describe("no-and-conditional", () => {
    it("flags && with JSX inside JSX", () => {
      const result = lintWith(
        "pyreon/no-and-conditional",
        "const App = () => <div>{isOpen && <Modal/>}</div>",
      )
      expect(result.diagnostics).toHaveLength(1)
    })
  })

  describe("no-missing-for-by", () => {
    it("flags <For> without by prop", () => {
      const result = lintWith(
        "pyreon/no-missing-for-by",
        "<For each={items}>{item => <li/>}</For>",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows <For> with by prop", () => {
      const result = lintWith(
        "pyreon/no-missing-for-by",
        "<For each={items} by={i => i.id}>{item => <li/>}</For>",
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-index-as-by", () => {
    it("flags index function as by", () => {
      const result = lintWith(
        "pyreon/no-index-as-by",
        "<For each={items} by={(_, i) => i}>{item => <li/>}</For>",
      )
      expect(result.diagnostics).toHaveLength(1)
    })
  })
})

describe("lifecycle rules", () => {
  describe("no-missing-cleanup", () => {
    it("flags onMount with setInterval but no cleanup", () => {
      const result = lintWith(
        "pyreon/no-missing-cleanup",
        "onMount(() => { setInterval(() => {}, 1000) })",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows onMount with cleanup return", () => {
      const result = lintWith(
        "pyreon/no-missing-cleanup",
        "onMount(() => { const id = setInterval(() => {}, 1000); return () => clearInterval(id) })",
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-mount-in-effect", () => {
    it("flags onMount inside effect", () => {
      const result = lintWith(
        "pyreon/no-mount-in-effect",
        "effect(() => { onMount(() => {}) })",
      )
      expect(result.diagnostics).toHaveLength(1)
    })
  })

  describe("no-effect-in-mount", () => {
    it("flags effect inside onMount", () => {
      const result = lintWith(
        "pyreon/no-effect-in-mount",
        "onMount(() => { effect(() => {}) })",
      )
      expect(result.diagnostics).toHaveLength(1)
    })
  })
})

describe("performance rules", () => {
  describe("no-eager-import", () => {
    it("flags static import of heavy package", () => {
      const result = lintWith(
        "pyreon/no-eager-import",
        'import { Chart } from "@pyreon/charts"',
      )
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0].message).toContain("heavy package")
    })

    it("allows import of lightweight packages", () => {
      const result = lintWith(
        "pyreon/no-eager-import",
        'import { signal } from "@pyreon/reactivity"',
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })
})

describe("ssr rules", () => {
  describe("no-mismatch-risk", () => {
    it("flags Date.now() in JSX", () => {
      const result = lintWith(
        "pyreon/no-mismatch-risk",
        "const App = () => <span>{Date.now()}</span>",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("flags Math.random() in JSX", () => {
      const result = lintWith(
        "pyreon/no-mismatch-risk",
        "const App = () => <span>{Math.random()}</span>",
      )
      expect(result.diagnostics).toHaveLength(1)
    })
  })
})

describe("architecture rules", () => {
  describe("no-deep-import", () => {
    it("flags deep import into @pyreon/*/src/", () => {
      const result = lintWith(
        "pyreon/no-deep-import",
        'import { foo } from "@pyreon/core/src/internal/vnode"',
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows standard imports", () => {
      const result = lintWith(
        "pyreon/no-deep-import",
        'import { h } from "@pyreon/core"',
      )
      expect(result.diagnostics).toHaveLength(0)
    })

    it("allows documented subpath exports", () => {
      const result = lintWith(
        "pyreon/no-deep-import",
        'import { jsx } from "@pyreon/core/jsx-runtime"',
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-error-without-prefix", () => {
    it("flags unprefixed error message", () => {
      const result = lintWith(
        "pyreon/no-error-without-prefix",
        'throw new Error("Invalid props")',
        "packages/core/core/src/index.ts",
      )
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0].fix).toBeDefined()
    })

    it("allows prefixed error message", () => {
      const result = lintWith(
        "pyreon/no-error-without-prefix",
        'throw new Error("[Pyreon] Invalid props")',
        "packages/core/core/src/index.ts",
      )
      expect(result.diagnostics).toHaveLength(0)
    })

    it("skips test files", () => {
      const result = lintWith(
        "pyreon/no-error-without-prefix",
        'throw new Error("test failure")',
        "packages/core/core/src/tests/foo.test.ts",
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("no-duplicate-store-id", () => {
    it("flags duplicate defineStore IDs", () => {
      const result = lintWith(
        "pyreon/no-duplicate-store-id",
        'defineStore("auth", () => {}); defineStore("auth", () => {})',
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows unique IDs", () => {
      const result = lintWith(
        "pyreon/no-duplicate-store-id",
        'defineStore("auth", () => {}); defineStore("user", () => {})',
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })
})

describe("styling rules", () => {
  describe("no-inline-style-object", () => {
    it("flags inline style object", () => {
      const result = lintWith(
        "pyreon/no-inline-style-object",
        '<div style={{ color: "red" }} />',
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows style string", () => {
      const result = lintWith(
        "pyreon/no-inline-style-object",
        '<div style="color: red" />',
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  describe("prefer-cx", () => {
    it("flags string concatenation in class", () => {
      const result = lintWith(
        "pyreon/prefer-cx",
        'const App = () => <div class={"btn " + extra} />',
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("flags template literal in class", () => {
      const result = lintWith(
        "pyreon/prefer-cx",
        "const App = () => <div class={`btn ${extra}`} />",
      )
      expect(result.diagnostics).toHaveLength(1)
    })
  })
})

describe("accessibility rules", () => {
  describe("dialog-a11y", () => {
    it("flags dialog without aria-label", () => {
      const result = lintWith(
        "pyreon/dialog-a11y",
        "<dialog><p>Hello</p></dialog>",
      )
      expect(result.diagnostics).toHaveLength(1)
    })

    it("allows dialog with aria-label", () => {
      const result = lintWith(
        "pyreon/dialog-a11y",
        '<dialog aria-label="Confirm">Hello</dialog>',
      )
      expect(result.diagnostics).toHaveLength(0)
    })

    it("allows dialog with aria-labelledby", () => {
      const result = lintWith(
        "pyreon/dialog-a11y",
        '<dialog aria-labelledby="title">Hello</dialog>',
      )
      expect(result.diagnostics).toHaveLength(0)
    })
  })
})

describe("presets", () => {
  it("recommended preset enables all rules", () => {
    const { presets } = require("../config/presets")
    const ruleCount = Object.keys(presets.recommended.rules).length
    expect(ruleCount).toBe(allRules.length)
  })

  it("strict preset promotes warnings to errors", () => {
    const { presets } = require("../config/presets")
    const warnRules = Object.entries(presets.strict.rules).filter(([_, sev]) => sev === "warn")
    expect(warnRules).toHaveLength(0)
  })

  it("app preset disables library-specific rules", () => {
    const { presets } = require("../config/presets")
    expect(presets.app.rules["pyreon/dev-guard-warnings"]).toBe("off")
    expect(presets.app.rules["pyreon/no-circular-import"]).toBe("off")
  })
})

describe("rule metadata", () => {
  it("all rules have unique IDs", () => {
    const ids = allRules.map((r) => r.meta.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("all rule IDs start with pyreon/", () => {
    for (const rule of allRules) {
      expect(rule.meta.id).toMatch(/^pyreon\//)
    }
  })

  it("all rules have descriptions", () => {
    for (const rule of allRules) {
      expect(rule.meta.description.length).toBeGreaterThan(10)
    }
  })

  it("all rules have valid categories", () => {
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

  it("all rules have valid default severity", () => {
    for (const rule of allRules) {
      expect(["error", "warn", "info"]).toContain(rule.meta.defaultSeverity)
    }
  })

  it("has 51 rules total", () => {
    expect(allRules.length).toBe(51)
  })
})

describe("source utilities", () => {
  it("LineIndex maps offset to line/column correctly", () => {
    const { LineIndex } = require("../utils/source")
    const index = new LineIndex("abc\ndef\nghi")

    expect(index.getLocation(0)).toEqual({ line: 1, column: 0 }) // 'a'
    expect(index.getLocation(3)).toEqual({ line: 1, column: 3 }) // '\n'
    expect(index.getLocation(4)).toEqual({ line: 2, column: 0 }) // 'd'
    expect(index.getLocation(8)).toEqual({ line: 3, column: 0 }) // 'g'
  })
})

import { describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { lintFile } from '../runner'
import { allRules } from '../rules'
import type { LintConfig } from '../types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { _resetProjectDepsCache } from '../utils/project-deps'

const defaultConfig = (): LintConfig => getPreset('recommended')
const find = (
  result: ReturnType<typeof lintFile>,
  id: string,
): ReturnType<typeof lintFile>['diagnostics'] =>
  result.diagnostics.filter((d) => d.ruleId === id)

describe('pyreon/no-error-without-prefix (architecture)', () => {
  // `no-error-without-prefix` now fires only inside a `@pyreon/*` package
  // (the `[Pyreon]` prefix is a framework convention, not for consumer app
  // errors). Run these specs in a temp project whose manifest is named
  // `@pyreon/foo`, preserving the relative path so `exemptPaths` substrings
  // still match. A consumer-project spec (below) asserts the silent path.
  let FWROOT: string
  beforeAll(() => {
    FWROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-lr8-fw-')))
    fs.writeFileSync(path.join(FWROOT, 'package.json'), JSON.stringify({ name: '@pyreon/foo' }))
  })
  afterAll(() => {
    fs.rmSync(FWROOT, { recursive: true, force: true })
  })
  beforeEach(() => {
    _resetProjectDepsCache()
  })
  const fwLint = (code: string, absPath: string, config = defaultConfig()) => {
    const rel = absPath.replace(/^\/abs\//, '')
    const abs = path.join(FWROOT, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, code)
    return lintFile(abs, code, allRules, config)
  }

  it('does NOT fire in a CONSUMER project (package not @pyreon/*) — the LR-8 fix', () => {
    const consumer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-lr8-consumer-')))
    fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'my-app' }))
    const abs = path.join(consumer, 'src', 'x.ts')
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    const code = `function f() { throw new Error("Save failed (500)") }`
    fs.writeFileSync(abs, code)
    const result = lintFile(abs, code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
    fs.rmSync(consumer, { recursive: true, force: true })
  })
  it('flags `throw new Error("msg")` without [Pyreon] prefix', () => {
    const code = `function f() { throw new Error("oops") }`
    const result = fwLint(code, '/abs/packages/core/foo/src/x.ts')
    const diags = find(result, 'pyreon/no-error-without-prefix')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT flag when [Pyreon] prefix is present', () => {
    const code = `function f() { throw new Error("[Pyreon] oops") }`
    const result = fwLint(code, '/abs/packages/core/foo/src/x.ts')
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('flags template literal Error without prefix', () => {
    const code = `function f(x) { throw new Error(\`oops \${x}\`) }`
    const result = fwLint(code, '/abs/packages/core/foo/src/x.ts')
    const diags = find(result, 'pyreon/no-error-without-prefix')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT flag template literal with [Pyreon] prefix', () => {
    const code = `function f(x) { throw new Error(\`[Pyreon] oops \${x}\`) }`
    const result = fwLint(code, '/abs/packages/core/foo/src/x.ts')
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT flag the scoped [@pyreon/<pkg>] convention (string)', () => {
    const code = `function f() { throw new Error("[@pyreon/state-tree] not a model instance") }`
    const result = fwLint(code, '/abs/packages/core/foo/src/x.ts')
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT flag the scoped [@pyreon/<pkg>] convention (template)', () => {
    const code = `function f(x) { throw new Error(\`[@pyreon/hotkeys] invalid shortcut: \${x}\`) }`
    const result = fwLint(code, '/abs/packages/core/foo/src/x.ts')
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('still flags an unrelated bracket prefix (e.g. [Vue])', () => {
    const code = `function f() { throw new Error("[Vue] oops") }`
    const result = fwLint(code, '/abs/packages/core/foo/src/x.ts')
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBeGreaterThan(0)
  })

  it('does NOT fire under an exemptPaths entry (e.g. CLI scaffolders)', () => {
    const config: LintConfig = {
      rules: {
        ...defaultConfig().rules,
        'pyreon/no-error-without-prefix': ['warn', { exemptPaths: ['packages/zero/create-zero/'] }],
      },
    }
    const code = `function f() { throw new Error("Project name cannot be empty.") }`
    const result = fwLint(code, '/abs/packages/zero/create-zero/src/args.ts', config)
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT fire on throws of non-Error values', () => {
    const code = `function f() { throw "string" }`
    const result = fwLint(code, '/abs/packages/core/foo/src/x.ts')
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT fire on throws of non-Identifier callee (new x.Error())', () => {
    const code = `function f() { throw new x.Error("oops") }`
    const result = fwLint(code, '/abs/packages/core/foo/src/x.ts')
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT fire on Error() with no args (empty throw)', () => {
    const code = `function f() { throw new Error() }`
    const result = fwLint(code, '/abs/packages/core/foo/src/x.ts')
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })

  it('does NOT fire in test files', () => {
    const code = `function f() { throw new Error("oops") }`
    const result = lintFile(
      '/abs/packages/core/foo/src/tests/x.test.ts',
      code,
      allRules,
      defaultConfig(),
    )
    expect(find(result, 'pyreon/no-error-without-prefix').length).toBe(0)
  })
})

describe('pyreon/no-map-in-jsx (jsx)', () => {
  it('flags arr.map((x) => <li>{x}</li>) inside JSX text expression', () => {
    const code = `function App({ items }) { return <ul>{items.map((x) => <li>{x}</li>)}</ul> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-map-in-jsx')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT flag arr.map at module/function scope (not inside JSX)', () => {
    const code = `const list = [1,2,3].map(x => x*2); export { list }`
    const result = lintFile('/abs/packages/core/foo/src/x.ts', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-map-in-jsx').length).toBe(0)
  })
})

describe('pyreon/no-index-as-by (jsx)', () => {
  it('flags <For by={(_, i) => i}> shape', () => {
    const code = `function App({ items }) { return <For each={items} by={(_, i) => i}>{(x) => <li>{x}</li>}</For> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    const diags = find(result, 'pyreon/no-index-as-by')
    expect(diags.length).toBeGreaterThan(0)
  })

  it('does NOT flag <For by={item => item.id}>', () => {
    const code = `function App({ items }) { return <For each={items} by={(it) => it.id}>{(x) => <li>{x.name}</li>}</For> }`
    const result = lintFile('/abs/packages/core/foo/src/x.tsx', code, allRules, defaultConfig())
    expect(find(result, 'pyreon/no-index-as-by').length).toBe(0)
  })
})

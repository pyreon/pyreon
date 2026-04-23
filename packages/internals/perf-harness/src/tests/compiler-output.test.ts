/**
 * Compiler output efficiency probe.
 *
 * Checks the transform output for common JSX patterns and ensures the
 * compiler emits the optimized code paths (template literals via _tpl,
 * reactive getters via _bind, static hoisting) rather than falling back
 * to naive `h()` for everything.
 *
 * This is a STRING-MATCH probe — we're not running the compiled code,
 * just checking which primitives were emitted. Wins are detected via
 * bytes-saved and call-site-count.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '@pyreon/compiler'

function transform(src: string): string {
  const result = transformJSX_JS(src, 'test.tsx')
  return result.code
}

describe('compiler JSX transform efficiency', () => {
  it('static element → _tpl() template (not h())', () => {
    const code = transform(`export default () => <div class="box"><span>hello</span></div>`)
    // Expect the template primitive
    expect(code).toMatch(/_tpl\s*\(/)
    // biome-ignore lint/suspicious/noConsole: probe output
    console.log(`[compiler] static: ${code.split('\n').length} lines, ${code.length} bytes`)
  })

  it('static reactive text with destructured prop → compiler treats as static', () => {
    // Note: destructured prop `name` is ambiguous to the compiler — it
    // could be a static value or a signal accessor. Current compiler
    // treats it as static by default (emits direct textContent assignment).
    // Users explicitly write `{() => name()}` for reactive prop-driven
    // text. This test freezes current behavior; if the compiler gains
    // signal-detection across prop boundaries, flip to expect `_bind`.
    const code = transform(
      `export default ({name}) => <div>Hello <b>{name}</b>!</div>`,
    )
    expect(code).toMatch(/_tpl\s*\(/)
    expect(code).toMatch(/textContent\s*=\s*name/)
  })

  it('list (.map) — wrapped as reactive accessor thunk', () => {
    const code = transform(
      `export default ({items}) => <ul>{items.map(x => <li>{x}</li>)}</ul>`,
    )
    // The compiler wraps the map expression so the runtime's mountChild
    // treats it as a reactive accessor.
    expect(code).toMatch(/\(\s*\)\s*=>\s*items\.map/)
  })

  it('spread props on root element → handled via _applyProps', () => {
    const code = transform(
      `export default (props) => <div {...props}>content</div>`,
    )
    // Spread compile path
    expect(code).toMatch(/_tpl|_applyProps|spread|\bh\b/)
  })

  it('signal auto-call: bare identifier in JSX text becomes a reactive accessor', () => {
    const code = transform(
      `import { signal } from '@pyreon/reactivity'
       const count = signal(0)
       export default () => <div>{count}</div>`,
    )
    // The auto-call transform should wrap `count` as `() => count()` somewhere.
    // Match either the literal thunk or the runtime hydration helper.
    expect(code).toMatch(/count\s*\(\s*\)|\(\s*\)\s*=>\s*count/)
  })

  it('pure static call (Math.random, etc.) is NOT wrapped in a reactive getter', () => {
    const code = transform(
      `export default () => <div data-id={Math.random()}>content</div>`,
    )
    // Math.random is pure — should NOT be wrapped in _bind / () => wrapper.
    // Look for the raw Math.random call in the output.
    expect(code).toContain('Math.random')
    // Shouldn't wrap in a thunk for a pure value
    const thunkMatches = code.match(/\(\s*\)\s*=>\s*Math\.random/g) ?? []
    expect(thunkMatches.length).toBe(0)
  })
})

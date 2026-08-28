/**
 * JSX has no line comments. `// …` in child position is JSXText and RENDERS —
 * on web, and through PMTC as a native `Text` node on iOS and Android.
 *
 * Found once for real, in the native-tasks example: six explanatory lines
 * above a `<Scroll>` put a paragraph about `kAXScrollToVisibleAction` at the
 * top of the running screen on all three targets, with no compiler saying
 * anything. A line-oriented grep over the repo returned 1,212 candidates,
 * essentially all of them genuine comments inside `{}` containers — the shape
 * is only visible with an AST, which is the argument for a rule over a habit.
 */
import type { LintConfig } from '../types'
import { noLineCommentInJsx } from '../rules/jsx/no-line-comment-in-jsx'
import { lintFile } from '../runner'

const ID = 'pyreon/no-line-comment-in-jsx'
const ON: LintConfig = { rules: { [ID]: 'error' } }
const lint = (code: string) => lintFile('src/App.tsx', code, [noLineCommentInJsx], ON)
const run = (code: string): string[] => lint(code).diagnostics.map((d) => d.ruleId)

describe('pyreon/no-line-comment-in-jsx', () => {
  it('fires on the shape that shipped — a comment above a sibling element', () => {
    const code = `export function C() {
  return (
    <Stack>
    // Scrollable, because this screen carries ~20 readouts and
    // overflows a phone viewport.
    <Scroll><Text>x</Text></Scroll>
    </Stack>
  )
}`
    expect(run(code)).toContain(ID)
  })

  it('fires on a single stray line too', () => {
    const code = `export function C() {
  return (<Stack>
    // TODO: revisit
    <Text>x</Text>
  </Stack>)
}`
    expect(run(code)).toContain(ID)
  })

  it('does NOT fire on a real comment inside an expression container', () => {
    // The overwhelmingly common shape, and valid JS. Firing here would make
    // the rule unusable — 1,212 of these exist in this repo.
    const code = `export function C() {
  return (<Stack>
    {/* fine */}
    {
      // also fine — this is JS, inside a container
      cond ? <A /> : <B />
    }
    <Text>x</Text>
  </Stack>)
}`
    expect(run(code)).not.toContain(ID)
  })

  it('does NOT fire on a `{/* … */}` comment', () => {
    const code = `export function C() {
  return (<Stack>{/* a proper JSX comment */}<Text>x</Text></Stack>)
}`
    expect(run(code)).not.toContain(ID)
  })

  it('does NOT fire on a displayed code sample', () => {
    // Text on its own, under a code tag — that `//` is the content.
    const code = `export function C() {
  return (<pre><code>// this is what the emit looks like</code></pre>)
}`
    expect(run(code)).not.toContain(ID)
  })

  it('does NOT fire on ordinary prose that merely contains a slash', () => {
    const code = `export function C() {
  return (<Stack>read the https://example.com page<Text>x</Text></Stack>)
}`
    expect(run(code)).not.toContain(ID)
  })

  it('does NOT fire on text with no element sibling', () => {
    // Not the mistake's shape, and the safest place to stay quiet.
    const code = `export function C() { return (<Text>// literally the text</Text>) }`
    expect(run(code)).not.toContain(ID)
  })

  it('names the fix in the message', () => {
    const code = `export function C() { return (<Stack>
    // x
    <Text>y</Text></Stack>) }`
    const d = lint(code).diagnostics.find((x) => x.ruleId === ID)
    expect(d?.message).toContain('{/*')
  })
})

/**
 * A component declared inside a callback compiles exactly like the same
 * component at module level.
 *
 * Every `const` inside a call-argument callback is excluded from signal and
 * prop-derived tracking (`_callbackDepth > 0`) — a `.map` row is not a
 * component body. The exclusion also reached the body of a COMPONENT declared
 * inside such a callback, so `function Page` inside `test('…', () => { … })`
 * compiled `when={open}` as a pass-through while the module-level `Page`
 * compiled it to `_rp(() => open())` (found triaging #4830: the issue's repro
 * passed in a test file and failed in the app). A capitalized component
 * (`function Page`, `const Page = () => …`) now starts its own depth-0 frame,
 * in both backends.
 *
 * Bisect: drop the `outerCallbackDepth` reset in `walkNode` (JS) / the
 * `enter_component_body` calls (Rust) → the in-callback rows emit
 * `when={open}` and differ from the module-level emit.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (code: string, filename: string, ssr: boolean, known: null) => { code: string }

let nativeTransform: NativeTransform | null = null

try {
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  nativeTransform = (
    requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as {
      transformJsx: NativeTransform
    }
  ).transformJsx
} catch {
  // The JS contract still runs; native parity runs when the addon is built.
}

const HEADER = `import { computed, signal } from '@pyreon/reactivity'\n`

/** The emitted `<Comp …>` line of `src`, from each backend (they must agree). */
function compLine(src: string, ssr = false): string | undefined {
  const pick = (code: string) =>
    code
      .split('\n')
      .find((l) => l.includes('<Comp') || l.includes('h(Comp') || l.includes('Comp,'))
      ?.trim()
  const js = pick(transformJSX_JS(HEADER + src, 'c.tsx', { ssr }).code)
  if (nativeTransform) expect(pick(nativeTransform(HEADER + src, 'c.tsx', ssr, null).code)).toBe(js)

  return js
}

const declBody = `{
    const open = signal(false)
    const shown = computed(() => open())
    return <Comp when={open} label={shown} />
  }`

const PAGE_DECL = `function Page() ${declBody}`
const PAGE_ARROW = `const Page = () => ${declBody}`
const PAGE_FN_EXPR = `const Page = function () ${declBody}`

const WRAPS: [string, (component: string) => string][] = [
  ['a test() callback', (c) => `test('x', () => {\n  ${c}\n})`],
  ['an async callback', (c) => `run(async () => {\n  ${c}\n})`],
  ['a function-expression callback', (c) => `run(function () {\n  ${c}\n})`],
  ['two callbacks deep', (c) => `describe('a', () => {\n  it('b', () => {\n    ${c}\n  })\n})`],
]

describe('a component nested in a callback tracks its signals like a module-level one', () => {
  for (const [form, component] of [
    ['function declaration', PAGE_DECL],
    ['const arrow', PAGE_ARROW],
    ['const function expression', PAGE_FN_EXPR],
  ] as const) {
    const moduleLevel = compLine(component)

    it(`${form} at module level auto-calls (control)`, () => {
      expect(moduleLevel).toContain('_rp(() => open())')
      expect(moduleLevel).toContain('_rp(() => shown())')
    })

    for (const [where, wrap] of WRAPS) {
      it(`${form} inside ${where}`, () => {
        expect(compLine(wrap(component))).toBe(moduleLevel)
      })
    }
  }

  it('SSR emit agrees too', () => {
    expect(compLine(WRAPS[0]![1](PAGE_DECL), true)).toBe(compLine(PAGE_DECL, true))
  })

  it('the callback depth is restored after the component: a sibling callback const stays untracked', () => {
    const src = `run(() => {
  ${PAGE_DECL}
  const open = signal(false)
  const row = <Comp when={open} />
})`
    const js = transformJSX_JS(HEADER + src, 'c.tsx').code
    if (nativeTransform) expect(nativeTransform(HEADER + src, 'c.tsx', false, null).code).toBe(js)
    expect(js).toContain('const row = <Comp when={open} />')
  })

  it('a lowercase callback (a .map row) is not a component body: unchanged', () => {
    const src = `const rows = items.map((it) => {
  const open = signal(false)
  return <Comp when={open} />
})`
    expect(compLine(src)).toContain('when={open}')
  })
})

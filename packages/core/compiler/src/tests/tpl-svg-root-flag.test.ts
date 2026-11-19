/**
 * `_tpl` flag 2 — a template rooted at a bare SVG element is marked at COMPILE
 * time, in both backends.
 *
 * `innerHTML` enters SVG foreign content only at a literal `<svg>`, so a
 * template string rooted at `<g>` / `<path>` / `<linearGradient>` parses as
 * inert HTML elements unless the runtime wraps it. The runtime used to decide
 * that itself from an 80-name table shipped in every client bundle; the
 * compiler now decides it from the root tag and passes flag 2 (combined with
 * the re-mountable flag 1 for a component child, so `3`). The runtime half is
 * `runtime-dom/src/tests/tpl-svg-namespace.test.ts`.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (code: string, filename: string, ssr: boolean, knownSignals: string[] | null) => {
  code: string
}

let nativeTransform: NativeTransform | null = null

try {
  // A napi `.node` addon cannot be loaded through `await import()`.
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  nativeTransform = (
    requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as { transformJsx: NativeTransform }
  ).transformJsx
} catch {
  // Native not built — the Rust half is skipped; native-equivalence reports it.
}

const js = (code: string): string => transformJSX_JS(code, 'c.tsx').code
const rust = (code: string): string | null => nativeTransform?.(code, 'c.tsx', false, null).code ?? null

/** The flag argument of the single `_tpl(...)` call in `out`, or null when it has none. */
function tplFlag(out: string): string | null {
  const start = out.indexOf('_tpl(')
  expect(start, out).toBeGreaterThanOrEqual(0)
  // Walk to the call's closing paren (strings in these fixtures hold no parens).
  let depth = 0
  for (let i = start + 4; i < out.length; i++) {
    const c = out[i]
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) {
      const m = /, (\d)$/.exec(out.slice(start, i))
      return m ? (m[1] as string) : null
    }
  }
  throw new Error(`unterminated _tpl call in ${out}`)
}

const CASES: { name: string; src: string; flag: string | null }[] = [
  { name: 'bare <g> root with a binding', src: 'export const E = () => <g><path d={d()} /></g>', flag: '2' },
  { name: 'static <g> root', src: 'export const E = () => <g class="a"><path /></g>', flag: '2' },
  {
    name: 'camelCase root <linearGradient>',
    src: 'export const E = () => <linearGradient id="g"><stop offset="0" /></linearGradient>',
    flag: '2',
  },
  { name: 'dashed root <font-face>', src: 'export const E = () => <font-face><font-face-src /></font-face>', flag: '2' },
  { name: '<g> as a component child (re-mountable too)', src: 'export const E = () => <Show when={x}><g class="a"><path /></g></Show>', flag: '3' },
  {
    name: 'bound <g> as a component child',
    src: 'export const E = () => <Show when={x}><g class={c()}><path /></g></Show>',
    flag: '3',
  },
  { name: 'an <svg> root opens SVG content by itself', src: 'export const E = () => <svg viewBox="0 0 1 1"><g><path /></g></svg>', flag: null },
  { name: 'HTML root', src: 'export const E = () => <div class="a"><span>{t()}</span></div>', flag: null },
  { name: 'HTML-shared <a> stays HTML', src: 'export const E = () => <a href="x"><span /></a>', flag: null },
  { name: 'HTML-shared <title> stays HTML', src: 'export const E = () => <title>T<span /></title>', flag: null },
  { name: 'HTML root as a component child', src: 'export const E = () => <Show when={x}><div class="a"><span /></div></Show>', flag: '1' },
  // #4453: the root list must be complete — a missing SVG name parses as inert HTML.
  ...['feDropShadow', 'feFuncA', 'feDistantLight', 'mpath', 'switch', 'view', 'animateColor'].map((tag) => ({
    name: `<${tag}> (missing from the old runtime list)`,
    src: `export const E = () => <${tag} id="x"><desc /></${tag}>`,
    flag: '2' as string | null,
  })),
  { name: 'HTML-shared <font> stays HTML', src: 'export const E = () => <font><span /></font>', flag: null },
]

describe('_tpl SVG-root flag (compile-time)', () => {
  it.each(CASES)('JS backend: $name', ({ src, flag }) => {
    expect(tplFlag(js(src))).toBe(flag)
  })

  it.each(CASES)('Rust backend emits the same: $name', ({ src, flag }) => {
    const out = rust(src)
    if (out === null) return
    expect(tplFlag(out)).toBe(flag)
    expect(out).toBe(js(src))
  })
})

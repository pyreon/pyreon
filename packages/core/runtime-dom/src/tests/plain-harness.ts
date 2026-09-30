/**
 * Shared Plain-Mode TEST HARNESS — compile a module through the REAL
 * `transformJSX` (plain pre-pass + JSX transform), lower the residual JSX
 * with esbuild's automatic runtime (the production setting), execute the
 * output with runtime deps injected, and mount components. Used by
 * `plain-mode.test.tsx` (behavioral specs) and
 * `plain-roundtrip-fuzz.test.tsx` (the classic → codemod → compile →
 * behavioral-diff oracle). NOT a test file — no specs here.
 */
import { transformSync } from 'esbuild'
import { transformJSX } from '@pyreon/compiler'
import * as JsxRuntime from '@pyreon/core/jsx-runtime'
import * as CoreNs from '@pyreon/core'
import { Fragment, h, _rp, _rpd, cx } from '@pyreon/core'
import * as DomNs from '../index'
import * as ReactivityNs from '@pyreon/reactivity'
import { _bind, computed, createStore, effect, signal } from '@pyreon/reactivity'
import { _tpl, _bindText, _bindDirect, _setChild, _setChildAt, _textSlot } from '../template'
import {
  _applyProps,
  _setAttr,
  _setClass,
  _setStyle,
  _setValue,
  bindPolymorphicText,
  mountChild, _bindProp,} from '../index'

/**
 * Every `_`-prefixed helper the compiler can emit, taken from the packages'
 * own exports — a hand-listed set silently fell behind when the compiler
 * learned text fusion (`_fuse`), and the round-trip fuzz reported the resulting
 * `ReferenceError` as a render divergence. Explicit entries below still win.
 */
const underscoreHelpers = (ns: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(ns).filter(([k]) => k.startsWith('_') && !k.startsWith('__')))

export const RUNTIME_DEPS = {
  ...underscoreHelpers(CoreNs as Record<string, unknown>),
  ...underscoreHelpers(DomNs as Record<string, unknown>),
  _tpl,
  _bind,
  _bindText,
  _bindProp,
  _textSlot,
  _bindDirect,
  _setChild,
  _setChildAt,
  bindPolymorphicText,
  _applyProps,
  _setStyle,
  _setClass,
  _setAttr,
  _setValue,
  _rp,
  _rpd,
  _cx: cx,
  h,
  Fragment,
  signal,
  computed,
  createStore,
  effect,
  document,
} as const

const FRAMEWORK_MODULES: Record<string, Record<string, unknown>> = {
  '@pyreon/core': CoreNs as Record<string, unknown>,
  '@pyreon/reactivity': ReactivityNs as Record<string, unknown>,
  '@pyreon/runtime-dom': DomNs as Record<string, unknown>,
}

/**
 * Bind every named import the compiled module takes from a framework package
 * (including ALIASED ones the compiler injects, e.g.
 * `splitProps as __plainSplitProps`) — `stripImports` drops the statements,
 * so without this an injected alias is a ReferenceError at mount.
 */
function resolveFrameworkImports(code: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const ns = FRAMEWORK_MODULES[m[2]!]
    if (!ns) continue
    for (const part of m[1]!.split(',')) {
      const [orig, alias] = part.split(/\s+as\s+/).map((x) => x.trim())
      if (orig && orig in ns) out[alias ?? orig] = ns[orig]
    }
  }
  return out
}

export function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

/**
 * Lower the transform's RESIDUAL JSX the way a real build does — esbuild's
 * automatic runtime with `jsxImportSource: "@pyreon/core"` (the production
 * setting). Alias names are read back off the emitted import statement.
 */
export function lowerResidualJsx(code: string): { js: string; extra: Record<string, unknown> } {
  const out = transformSync(code, {
    loader: 'tsx',
    jsx: 'automatic',
    jsxImportSource: '@pyreon/core',
  }).code
  const jsxRuntime = JsxRuntime as unknown as Record<string, unknown>
  const extra: Record<string, unknown> = {}
  const importRe = /import\s*\{([^}]*)\}\s*from\s*"[^"]*jsx-runtime"/g
  for (const m of out.matchAll(importRe)) {
    for (const part of (m[1] as string).split(',')) {
      const [orig, alias] = part.split(' as ').map((s) => s.trim())
      if (!orig) continue
      extra[alias ?? orig] = jsxRuntime[orig]
    }
  }
  return { js: stripImports(out), extra }
}

/**
 * Compile a Plain-Mode MODULE (plain pre-pass + JSX transform + residual-JSX
 * lowering), execute it with runtime deps injected, and return its named
 * exports. `globals` are extra bindings the source mentions.
 */
export function compilePlainModule<T extends Record<string, unknown>>(
  source: string,
  exportNames: string[],
  globals: Record<string, unknown> = {},
  transformOptions: { ssr?: boolean } = {},
): { exports: T; code: string } {
  const result = transformJSX(source, 'plain-test.tsx', transformOptions)
  const imported = resolveFrameworkImports(result.code)
  const { js, extra } = lowerResidualJsx(stripImports(result.code))
  const body = js.replace(/^export\s+(?=(const|function|let|var))/gm, '')
  const deps = { ...RUNTIME_DEPS, ...imported, ...extra, ...globals }
  const fn = new Function(...Object.keys(deps), `${body}\nreturn { ${exportNames.join(', ')} }`)
  return { exports: fn(...Object.values(deps)) as T, code: result.code }
}

export function mountComponent(
  Component: unknown,
  props: Record<string, unknown> = {},
): { container: HTMLDivElement; cleanup: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(h(Component as never, props), container) as () => void
  return { container, cleanup }
}


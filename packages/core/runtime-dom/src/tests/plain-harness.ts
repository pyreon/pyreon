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
import { Fragment, h, _rp, cx } from '@pyreon/core'
import { _bind, computed, createStore, effect, signal } from '@pyreon/reactivity'
import { _tpl, _bindText, _bindDirect, _setChild, _setChildAt } from '../template'
import {
  _applyProps,
  _setAttr,
  _setClass,
  _setStyle,
  _setValue,
  bindPolymorphicText,
  mountChild,
} from '../index'

export const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
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
  _cx: cx,
  h,
  Fragment,
  signal,
  computed,
  createStore,
  effect,
  document,
} as const

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
  const { js, extra } = lowerResidualJsx(stripImports(result.code))
  const body = js.replace(/^export\s+(?=(const|function|let|var))/gm, '')
  const deps = { ...RUNTIME_DEPS, ...extra, ...globals }
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


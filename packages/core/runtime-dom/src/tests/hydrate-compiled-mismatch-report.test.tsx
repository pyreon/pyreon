/**
 * happy-dom twin of `hydrate-compiled-mismatch-report.browser.test.tsx` (#4419).
 *
 * The browser suite cannot run the compiler or `renderToString`, so it runs
 * the compiled output and server HTML recorded in `_compiled-mismatch-cases.ts`.
 * This file is what keeps that record honest: it recompiles every case
 * through the REAL `transformJSX` (vitest's own JSX transform never emits
 * `_tpl`), lowers residual component JSX the same way, and requires the
 * recorded `compiled` and `match` strings to be exactly what the toolchain
 * produces today. A compiler or SSR change that moves a case fails here,
 * not silently in the browser.
 *
 * It also replays the reports under happy-dom, as a fast signal; the browser
 * suite is the evidence for hydration behaviour.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { For, Fragment, _fuse, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _bindDirect,
  _bindProp,
  _bindText,
  _mountSlot,
  _setChild,
  _setChildAt,
  _setClass,
  _textSlot,
  _tpl,
  hydrateRoot,
  onHydrationMismatch,
} from '../index'
import { bindPolymorphicText } from '../mount'
import {
  ATTRIBUTE_CASE,
  COMPILED_MISMATCH_CASES,
  type CompiledMismatchCase,
  type MismatchReport,
} from './_compiled-mismatch-cases'

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

const DEPS = {
  _bindDirect,
  _bindProp,
  _bindText,
  _fuse,
  _mountSlot,
  _setChild,
  _setChildAt,
  _setClass,
  _textSlot,
  _tpl,
  bindPolymorphicText,
  For,
  Fragment,
  h,
  signal,
}

const evaluate = (code: string, deps: Record<string, unknown>) =>
  new Function(...Object.keys(deps), `${code}\nreturn App`)(...Object.values(deps)) as () => unknown

afterEach(() => {
  document.body.innerHTML = ''
})

const ALL = [...COMPILED_MISMATCH_CASES, ATTRIBUTE_CASE]

describe('recorded cases match the real toolchain', () => {
  for (const c of ALL) {
    it(`${c.name}: compiled output and server HTML are current`, async () => {
      expect(lower(transformJSX(c.source, 'case.tsx').code)).toBe(c.compiled)
      // The SSR compile of the same source, rendered: the agreeing server.
      const ssr = evaluate(lower(transformJSX(c.source, 'case.tsx', { ssr: true }).code), {
        ...core,
        signal,
      })
      expect(await renderToString(h(ssr as never, null))).toBe(c.match)
    })
  }
})

function reportsOf(html: string, c: CompiledMismatchCase): MismatchReport[] {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const out: MismatchReport[] = []
  const off = onHydrationMismatch((ctx) =>
    out.push({ type: ctx.type, expected: String(ctx.expected), actual: String(ctx.actual), path: ctx.path }),
  )
  const warn = console.warn
  console.warn = () => {}
  try {
    hydrateRoot(host, h(evaluate(c.compiled, DEPS) as never, null))
  } finally {
    console.warn = warn
    off()
  }
  return out
}

describe('compiled hydration reports what it corrects (happy-dom)', () => {
  for (const c of ALL) {
    it(`${c.name}`, () => {
      expect(reportsOf(c.server, c)).toEqual(c.reports)
      expect(reportsOf(c.match, c)).toEqual([])
    })
  }
})

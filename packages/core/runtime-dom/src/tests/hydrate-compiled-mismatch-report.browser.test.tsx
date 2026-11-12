/**
 * Real-Chromium contract: a compiled template that ADOPTS server DOM reports
 * every divergence it corrects, through the same channel and in the same shape
 * as the h() walk (#4419).
 *
 * Before the fix the compiled binders wrote the client's value into the
 * adopted node and said nothing: no `[Pyreon] Hydration mismatch` warning, no
 * `onHydrationMismatch` call. A JSX app (nearly every component compiles to
 * `_tpl`) therefore never heard about an SSR/client divergence, while the same
 * content written with `h()` was reported.
 *
 * The rule: a mismatch is reported exactly when hydration CHANGES what the
 * server rendered. A value the server already rendered is never reported,
 * whatever its whitespace; every rewrite is, as on the h() path, which also
 * compares exactly. Attributes are reported on neither path.
 *
 * Each case runs the REAL compiler output (see `_compiled-mismatch-cases.ts`;
 * the happy-dom twin regenerates it and fails on drift).
 *
 * Bisect: revert `template.ts`, `mount.ts`, `hydrate.ts` and `hydration-debug.ts`
 * to main → all 16 divergence specs fail: the compiled cases report nothing,
 * the two h() empty-server cases report nothing, and the slot case (which the
 * h() walk already reported) reports its path as `slot > reactive > b` rather
 * than from the hydration root. The 13 agreement specs pass either way.
 */
import { For, Fragment, _fuse, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
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
  bindPolymorphicText,
  hydrateRoot,
  mount,
  onHydrationMismatch,
} from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ATTRIBUTE_CASE,
  COMPILED_MISMATCH_CASES,
  type CompiledMismatchCase,
  type MismatchReport,
} from './_compiled-mismatch-cases'

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

/** Evaluate a case's compiled module; a fresh call gets fresh signals. */
function compiledApp(c: CompiledMismatchCase): () => unknown {
  return new Function(...Object.keys(DEPS), `${c.compiled}\nreturn App`)(
    ...Object.values(DEPS),
  ) as () => unknown
}

afterEach(() => {
  document.body.innerHTML = ''
})

/** Hydrate `app` over `html`; collect handler reports and dev warnings. */
function hydrate(html: string, app: () => unknown) {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const serverRoot = host.firstElementChild
  const reports: MismatchReport[] = []
  const warnings: string[] = []
  const off = onHydrationMismatch((ctx) =>
    reports.push({
      type: ctx.type,
      expected: String(ctx.expected),
      actual: String(ctx.actual),
      path: ctx.path,
    }),
  )
  const realWarn = console.warn
  console.warn = (...args: unknown[]) => {
    const line = args.map(String).join(' ')
    if (line.includes('Hydration mismatch')) warnings.push(line)
  }
  try {
    hydrateRoot(host, h(app as never, null))
  } finally {
    console.warn = realWarn
    off()
  }
  return { host, reports, warnings, sameRoot: host.firstElementChild === serverRoot }
}

/** Markup without comments: range markers and anchors differ between a
 *  hydrated tree and a fresh mount by design, the content does not. */
const content = (html: string) => html.replace(/<!--[^]*?-->/g, '')

/** What a client-only mount of the same app renders. */
function freshMount(app: () => unknown): string {
  const host = document.createElement('div')
  mount(h(app as never, null), host)
  return content(host.innerHTML)
}

describe('compiled hydration reports what it corrects — real browser', () => {
  for (const c of COMPILED_MISMATCH_CASES) {
    it(`${c.name}: reported once, in the h() message shape`, () => {
      const r = hydrate(c.server, compiledApp(c))
      expect(r.reports).toEqual(c.reports)
      expect(r.warnings).toEqual(
        c.reports.map(
          (m) =>
            `[Pyreon] Hydration mismatch (${m.type}): expected ${m.expected}, got ${m.actual} at ${m.path}`,
        ),
      )
      // Reporting changes nothing about the repair: the page ends up as a
      // client-only mount of the same component.
      expect(content(r.host.innerHTML)).toBe(freshMount(compiledApp(c)))
    })

    it(`${c.name}: a matching server render reports nothing`, () => {
      const r = hydrate(c.match, compiledApp(c))
      expect(r.reports).toEqual([])
      expect(r.warnings).toEqual([])
      expect(content(r.host.innerHTML)).toBe(freshMount(compiledApp(c)))
    })
  }

  it('text-only divergence keeps the adopted server element', () => {
    // Reporting must not turn an in-place correction into a remount.
    const c = COMPILED_MISMATCH_CASES[0]!
    const r = hydrate(c.server, compiledApp(c))
    expect(r.sameRoot).toBe(true)
    expect(r.reports).toHaveLength(1)
  })

  it('a whitespace-only difference is reported on both paths, as the DOM changes on both', () => {
    const c = COMPILED_MISMATCH_CASES[0]!
    const padded = '<p id="w"> Rendered in the browser </p>'
    const compiled = hydrate(padded, compiledApp(c))
    const viaH = hydrate(padded, () => h('p', { id: 'w' }, 'Rendered in the browser'))
    expect(compiled.reports).toEqual([
      {
        type: 'text',
        expected: 'Rendered in the browser',
        actual: ' Rendered in the browser ',
        path: 'root > p > text',
      },
    ])
    expect(viaH.reports).toEqual(compiled.reports)
  })

  it('attributes are reported on neither path', () => {
    const compiled = hydrate(ATTRIBUTE_CASE.server, compiledApp(ATTRIBUTE_CASE))
    const viaH = hydrate(ATTRIBUTE_CASE.server, () => {
      const c = signal('client')
      return h('p', { class: () => c() }, 't')
    })
    expect(compiled.reports).toEqual([])
    expect(viaH.reports).toEqual([])
    expect(compiled.host.innerHTML).toBe('<p class="client">t</p>')
  })

  it('the h() path reports an accessor that renders text over an empty server element', () => {
    // The h() twin of the empty-server case above: it used to mount silently.
    const r = hydrate('<p id="w"></p>', () => h('p', { id: 'w' }, () => 'browser'))
    expect(r.reports).toEqual([
      { type: 'text', expected: 'browser', actual: '', path: 'root > p > reactive' },
    ])
  })

  it('the h() path reports an accessor that renders text into an empty server range', () => {
    const r = hydrate('<p><!--$--><!--/$--><b>b</b></p>', () =>
      h('p', null, () => 'browser', h('b', null, 'b')),
    )
    expect(r.reports).toEqual([
      { type: 'text', expected: 'browser', actual: '', path: 'root > p > reactive' },
    ])
    expect(r.host.innerHTML).toContain('browser')
  })
})

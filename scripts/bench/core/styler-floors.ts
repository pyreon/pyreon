/**
 * @pyreon/styler vs runtime CSS-in-JS (Emotion, goober), with zero-runtime
 * FLOORS (vanilla-extract, StyleX, Tailwind via clsx + tailwind-merge).
 *
 * Run: `bun scripts/bench/core/styler-floors.ts`. Harness and measurement
 * contract: `scripts/bench/rivals-harness.ts` (one process per op × arm ×
 * round, cluster-bootstrap CI95 over processes, gate before timing). The
 * engine-level suite (cold insert, warm dedup, dynamic resolve, SSR collect)
 * stays in `styler.ts`; this file answers "what does a component pay per
 * render to get its class name (and dynamic values) under each styling model".
 *
 * WHY FLOORS DO NOT RANK. vanilla-extract, StyleX, Panda, Tailwind and UnoCSS
 * generate their CSS at BUILD time. At runtime a component only assembles a
 * class-name string and, for dynamic values, an inline style object of CSS
 * custom properties that a prebuilt rule reads. Runtime CSS-in-JS (Pyreon
 * styler, Emotion, goober) builds, hashes and dedups the CSS text itself on
 * the render path. The two models do different work for the same visual
 * result, so the zero-runtime arms are printed as floors — the per-render
 * cost of not generating CSS at all — and are never the "best rival".
 *
 * Arms (doc pattern per arm):
 *  - Pyreon styler: `resolve(strings, values, props)` → `normalizeCSS` →
 *    `sheet.insert` — what a `styled()` render runs (same adapter as styler.ts).
 *  - Emotion: `@emotion/css` `css\`...\`` with interpolated values.
 *    https://emotion.sh/docs/@emotion/css
 *  - goober: `css\`...\`` with interpolated values. https://goober.js.org/api/css
 *  - vanilla-extract (floor): a build-time `style()` class plus
 *    `assignInlineVars({ [colorVar]: c, [bgVar]: b })` from
 *    `@vanilla-extract/dynamic` — its documented runtime-theming path.
 *    `createVar()` / `style()` run once under `setFileScope` (what the
 *    `.css.ts` evaluation does at build time).
 *    https://vanilla-extract.style/documentation/packages/dynamic/
 *  - StyleX (floor): `stylex.props(styles.base)` / `stylex.props(styles.dyn(c, b))`
 *    over the REAL `@stylexjs/babel-plugin` output, committed in
 *    `styler-floors/stylex.compiled.js` (source: `stylex.source.js`).
 *    https://stylexjs.com/docs/learn/styling-ui/defining-styles/#dynamic-styles
 *  - Tailwind (floor): `twMerge(clsx(...))` (the `cn()` helper shadcn/ui and
 *    most Tailwind component libraries use) plus a `style` object of custom
 *    properties for the dynamic values (`text-(--c) bg-(--bg)`, Tailwind v4
 *    arbitrary-variable syntax). UnoCSS application is the same class-string
 *    work and is not a separate arm.
 *    https://tailwindcss.com/docs/adding-custom-styles#using-arbitrary-values
 *
 * Skipped: Panda CSS. Its runtime `css()` / `cva()` live in the project's
 * generated `styled-system` (`panda codegen`); its per-render work is the same
 * class-string assembly StyleX's floor already shows, and dynamic values go
 * through inline CSS variables exactly as in the vanilla-extract arm.
 *
 * Ops:
 *  - `static style per render`: the same static block every call (runtime libs
 *    hit their dedup cache; floors assemble the class string).
 *  - `dynamic style, recurring values`: two dynamic colours cycling through 256
 *    values (a component re-rendering between a few states — runtime libs hit
 *    their dedup cache after the first lap).
 *  - `dynamic style, new value every render`: a fresh colour per call (the
 *    animation / colour-picker case — runtime libs insert a new rule each
 *    time; their caches grow for the whole process, as in an app).
 */
import createEmotion from '@emotion/css/create-instance'
import { createVar, style } from '@vanilla-extract/css'
import { endFileScope, setFileScope } from '@vanilla-extract/css/fileScope'
import { assignInlineVars } from '@vanilla-extract/dynamic'
import * as stylex from '@stylexjs/stylex'
import { clsx } from 'clsx'
import { css as gooberCss, extractCss as gooberExtract } from 'goober'
import { twMerge } from 'tailwind-merge'
import { normalizeCSS, resolve } from '../../../packages/ui-system/styler/src/resolve'
import { createSheet } from '../../../packages/ui-system/styler/src/sheet'
import { runRivalBench, type Arm } from '../rivals-harness'
// @ts-expect-error — generated JS, no declaration file
import { styles as sx } from './styler-floors/stylex.compiled.js'

type Id = 'pyreon' | 'emotion' | 'goober' | 'vanilla-extract' | 'stylex' | 'tailwind'
const ARMS: readonly Arm<Id>[] = [
  { id: 'pyreon', label: 'Pyreon styler' },
  { id: 'emotion', label: 'Emotion (@emotion/css)', pkg: '@emotion/css' },
  { id: 'goober', label: 'goober', pkg: 'goober' },
  { id: 'vanilla-extract', label: 'vanilla-extract', pkg: '@vanilla-extract/dynamic', ranking: false },
  { id: 'stylex', label: 'StyleX (compiled)', pkg: '@stylexjs/stylex', ranking: false },
  { id: 'tailwind', label: 'Tailwind (clsx + tailwind-merge)', pkg: 'tailwind-merge', ranking: false },
]

let sink = 0

const tt = (arr: string[]): TemplateStringsArray =>
  Object.assign(arr.slice(), { raw: arr.slice() }) as unknown as TemplateStringsArray
const WARM = tt([
  'display: inline-flex; gap: 8px; padding: 12px 16px; border-radius: 6px; background: #0d6efd; color: #fff;',
])
const DYN = tt(['color: ', '; background: ', '; padding: 10px; border-radius: 4px;'])
const STATIC_TW = 'inline-flex gap-2 px-4 py-3 rounded-md bg-[#0d6efd] text-white'
const DYN_TW = 'p-2.5 rounded text-(--c) bg-(--bg)'

// vanilla-extract: evaluated once, as its `.css.ts` would be at build time.
setFileScope('src/box.css.ts', 'bench')
const veColor = createVar()
const veBg = createVar()
const veStatic = style({ display: 'inline-flex', gap: 8, padding: '12px 16px' })
const veDyn = style({ color: veColor, background: veBg, padding: 10, borderRadius: 4 })
endFileScope()

/** One render's styling result, uniform across arms. */
type Styled = { className: string; style?: Record<string, string | undefined> }
type Render = { static: () => Styled; dyn: (c: string, b: string) => Styled; css: () => string }

function build(id: Id): Render {
  switch (id) {
    case 'pyreon': {
      const s = createSheet()
      const fc = (p: { c: string }) => p.c
      const fb = (p: { b: string }) => p.b
      return {
        static: () => ({ className: s.insert(normalizeCSS(resolve(WARM, [], {}))) }),
        dyn: (c, b) => ({ className: s.insert(normalizeCSS(resolve(DYN, [fc, fb], { c, b }))) }),
        css: () => s.getStyleTag(),
      }
    }
    case 'emotion': {
      const e = createEmotion({ key: 'eb' })
      return {
        static: () => ({ className: e.css(WARM) }),
        dyn: (c, b) => ({ className: e.css(DYN, c, b) }),
        css: () => Object.values(e.cache.inserted).join(''),
      }
    }
    case 'goober': {
      let collected = ''
      return {
        static: () => ({ className: gooberCss(WARM) }),
        dyn: (c, b) => ({ className: gooberCss(DYN, c, b) }),
        css: () => (collected += gooberExtract()),
      }
    }
    case 'vanilla-extract':
      return {
        static: () => ({ className: veStatic }),
        dyn: (c, b) => ({ className: veDyn, style: assignInlineVars({ [veColor]: c, [veBg]: b }) }),
        css: () => '',
      }
    case 'stylex':
      return {
        static: () => stylex.props(sx.base) as Styled,
        dyn: (c, b) => stylex.props(sx.dyn(c, b)) as Styled,
        css: () => '',
      }
    case 'tailwind':
      return {
        static: () => ({ className: twMerge(clsx(STATIC_TW)) }),
        dyn: (c, b) => ({ className: twMerge(clsx(DYN_TW)), style: { '--c': c, '--bg': b } }),
        css: () => '',
      }
  }
}

const size = (r: Styled): number => r.className.length + (r.style ? 1 : 0)

await runRivalBench<Id>({
  title: '@pyreon/styler vs Emotion / goober, with zero-runtime floors (vanilla-extract, StyleX, Tailwind)',
  file: import.meta.path,
  pyreon: 'pyreon',
  arms: ARMS,
  sink: () => sink,
  ops: {
    'static style per render': {
      skip: { 'vanilla-extract': 'no runtime work: the class is a build-time string constant' },
      make: (id) => {
        const r = build(id)
        return () => {
          sink += size(r.static())
        }
      },
    },
    'dynamic style, recurring values (256)': {
      make: (id) => {
        const r = build(id)
        let i = 0
        return () => {
          const v = i++ & 255
          sink += size(r.dyn(`rgb(${v},0,0)`, `rgb(0,${v},0)`))
        }
      },
    },
    'dynamic style, new value every render': {
      iters: 5_000,
      runs: 11,
      warmup: 1_000,
      make: (id) => {
        const r = build(id)
        let i = 0
        return () => {
          const v = i++
          sink += size(r.dyn(`rgb(${v & 255},${(v >> 8) & 255},${(v >> 16) & 255})`, `rgb(0,${v & 255},0)`))
        }
      },
    },
  },
  gate: () => {
    for (const arm of ARMS) {
      const r = build(arm.id)
      const fail = (what: string) => {
        throw new Error(`[correctness] ${arm.label}: ${what}`)
      }
      const st = r.static()
      if (!st.className) fail('static: no class name')
      const d = r.dyn('rgb(1,2,3)', 'rgb(4,5,6)')
      if (!d.className) fail('dynamic: no class name')
      if (arm.ranking === false) {
        // Floors: the dynamic values must reach the inline custom properties a
        // prebuilt rule reads.
        const vals = Object.values(d.style ?? {})
        if (!vals.includes('rgb(1,2,3)') || !vals.includes('rgb(4,5,6)'))
          fail(`dynamic values not in the inline style (${JSON.stringify(d.style)})`)
      } else {
        // Runtime CSS-in-JS: the generated CSS must hold both values under the class.
        const text = r.css().replace(/\s+/g, '')
        if (!text.includes('rgb(1,2,3)') || !text.includes('rgb(4,5,6)') || !text.includes(d.className))
          fail(`generated CSS lacks the dynamic rule (${d.className})`)
      }
      const d2 = r.dyn('rgb(7,8,9)', 'rgb(4,5,6)')
      if (arm.ranking !== false && d2.className === d.className) fail('different values produced the same class')
    }
  },
  footnotes: [
    'Floors (non-ranking) do no CSS generation at render time; their CSS ships prebuilt. Pyreon is ranked only against Emotion and goober.',
  ],
})

/**
 * A DOM element's spread argument compiles by ONE rule on every element path.
 *
 * The template path sliced it (`_applyProps(el, sliceExpr(arg))` /
 * `_bindSpread(el, () => (…))`): signals auto-called, prop-derived consts
 * inlined. The h() path — a self-closing element, an element with a
 * component child, every SSR render — left it verbatim, so
 * `<div {...{ onClick: () => count.set(count + 1) }} />` set the signal to its
 * own source text plus "1", and a prop-derived const in it read its setup
 * value. A component's spread was already sliced (`_wrapSpread(sliceExpr(…))`).
 *
 * The rule: the argument is sliced through `sliceExpr` on every path, and an
 * exactly-bare signal that is a property VALUE of an object-literal argument
 * stays bare on a DOM element (`isBareDomSpreadValue` / `dom_spread_obj`): a
 * DOM prop treats a function as a live accessor, so the bare form stays live on
 * the h() path, where the spread object is built once. A shorthand property
 * keeps its binding. Byte-identical in both backends, every output parsed.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (code: string, filename: string, ssr: boolean, known: string[] | null) => { code: string }

let nativeTransform: NativeTransform | null = null

try {
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  nativeTransform = (
    requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as { transformJsx: NativeTransform }
  ).transformJsx
} catch {
  // The JS contract still runs; native parity runs when the addon is built.
}

const app = (jsx: string) =>
  `import { computed, signal } from '@pyreon/reactivity'\nconst count = signal(0)\nconst pick = computed(() => count)\nfunction App(props) {\n  const label = props.label\n  return ${jsx}\n}`

/** The element paths a DOM spread can take. */
const PATHS: Record<string, (spread: string) => string> = {
  template: (sp) => `<div ${sp}>t</div>`,
  'h(): self-closing': (sp) => `<div ${sp} />`,
  'h(): with a component child': (sp) => `<div ${sp}><Comp /></div>`,
}

const ARGS: Record<string, { spread: string; has: string[]; not?: string[] }> = {
  'handler body auto-calls the signal': {
    spread: '{...{ onClick: () => count.set(count + 1) }}',
    has: ['count.set(count() + 1)'],
  },
  'bare signal property stays bare (live accessor)': {
    spread: '{...{ title: count }}',
    has: ['title: count }'],
    not: ['count()'],
  },
  'derived signal property is a read': {
    spread: '{...{ title: count + 1 }}',
    has: ['title: count() + 1'],
  },
  'prop-derived const is inlined': {
    spread: '{...{ title: label }}',
    has: ['title: (props.label)'],
  },
  'shorthand keeps the binding': {
    spread: '{...{ count }}',
    has: ['{ count }'],
    not: ['count()'],
  },
  'an on* or ref value is read: the computed returns the listener / ref': {
    spread: '{...{ onClick: pick, ref: pick, "data-x": pick }}',
    has: ['onClick: pick()', 'ref: pick()', '"data-x": pick }'],
  },
  'a computed key is read': {
    spread: '{...{ ["title"]: count }}',
    has: ['["title"]: count()'],
  },
  'parenthesized object literal: bare property stays bare': {
    spread: '{...({ title: count })}',
    has: ['title: count }'],
    not: ['count()'],
  },
}

const t = (src: string, ssr: boolean) => transformJSX_JS(src, 'a.tsx', { ssr }).code

describe('a DOM spread argument compiles by one rule on every path', () => {
  for (const [argName, { spread, has, not = [] }] of Object.entries(ARGS)) {
    for (const [pathName, build] of Object.entries(PATHS)) {
      for (const ssr of [false, true]) {
        it(`${argName} — ${pathName}${ssr ? ' (SSR)' : ''}`, () => {
          const out = t(app(build(spread)), ssr)
          for (const h of has) expect(out).toContain(h)
          for (const n of not) expect(out).not.toContain(n)
        })
      }
    }
  }

  it('the component spread is unchanged: sliced into _wrapSpread', () => {
    const out = t(app('<Comp {...{ onClick: () => count.set(count + 1), title: count }} />'), false)
    expect(out).toContain('_wrapSpread({ onClick: () => count.set(count() + 1), title: count() })')
  })

  it('a DOM spread inside JSX a handler builds follows the same rule', () => {
    const out = t(app('<button onClick={() => show(<i {...{ title: count, n: count + 1 }} />)}>x</button>'), false)
    expect(out).toContain('<i {...{ title: count, n: count() + 1 }} />')
  })
})

describe.runIf(nativeTransform !== null)('DOM spread: the native backend is byte-identical', () => {
  const sources: string[] = []
  for (const { spread } of Object.values(ARGS)) for (const build of Object.values(PATHS)) sources.push(app(build(spread)))
  sources.push(app('<button onClick={() => show(<i {...{ title: count, n: count + 1 }} />)}>x</button>'))
  for (const [i, src] of sources.entries()) {
    it(`source ${i}`, () => {
      for (const ssr of [false, true]) {
        const js = transformJSX_JS(src, 'a.tsx', { ssr }).code
        const rs = nativeTransform!(src, 'a.tsx', ssr, null).code
        expect(parseSync('a.tsx', js).errors, js).toEqual([])
        expect(parseSync('a.tsx', rs).errors, rs).toEqual([])
        expect(rs, `ssr=${ssr}`).toBe(js)
      }
    })
  }
})

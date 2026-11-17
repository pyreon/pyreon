/**
 * One rule for every component tag form (#4368).
 *
 * A member tag (`<m.X>`, `<UI.Button>`, `<Ctx.Provider>`, `<motion.div>`,
 * `<this.X>`) names a VALUE, so it is a component in every JSX dialect. The
 * compiler used to decide "component" from `jsxTagName(…)`, which reports ''
 * for a member tag, so its props compiled as if it were a DOM element: an
 * unbranded `() => props.b` the component received as a FUNCTION, a bare
 * `{...rest}` spread that read every getter once, and no `_lc` deferral for a
 * sole template child. Both backends agreed, so the equivalence oracles were
 * blind to it.
 *
 * The oracle here is METAMORPHIC and independent of backend agreement: a
 * component referenced through a member tag must compile exactly like the same
 * component bound to an identifier (`const X = m.X; <X …/>`), so the emit for
 * `<m.X …>` equals the emit for `<MX …>` with the tag text swapped back. That
 * holds for every attribute / child / spread shape, on every path.
 *
 * The identifier rule itself is the downstream JSX transforms' (TypeScript,
 * esbuild, oxc, Babel): a tag starting with an ASCII lowercase letter is a DOM
 * element, anything else a component. `<_Foo>` was a component in the native
 * backend and a DOM element (even templated as `<_Foo>`) in the JS one.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (
  ...args: [
    code: string,
    filename: string,
    ssr: boolean,
    knownSignals: string[] | null,
    reactivityLens?: boolean,
    collapse?: unknown,
    ssrTemplate?: boolean,
    templatizeComponentChildren?: boolean,
  ]
) => { code: string }

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
  // native binary not built: the JS assertions still run
}

interface Mode {
  name: string
  ssr: boolean
  ssrTemplate: boolean
  tpl: boolean
}

const MODES: Mode[] = [
  { name: 'client', ssr: false, ssrTemplate: false, tpl: false },
  { name: 'client+templatize', ssr: false, ssrTemplate: false, tpl: true },
  { name: 'ssr', ssr: true, ssrTemplate: false, tpl: false },
  { name: 'ssrTemplate', ssr: true, ssrTemplate: true, tpl: false },
]

type Backend = { name: string; run: (src: string, m: Mode) => string }

const BACKENDS: Backend[] = [
  {
    name: 'js',
    run: (src, m) =>
      transformJSX_JS(src, 'c.tsx', {
        ssr: m.ssr,
        ssrTemplate: m.ssrTemplate,
        templatizeComponentChildren: m.tpl,
      }).code,
  },
]

if (nativeTransform) {
  const nt = nativeTransform
  BACKENDS.push({
    name: 'native',
    run: (src, m) => nt(src, 'c.tsx', m.ssr, null, false, undefined, m.ssrTemplate, m.tpl).code,
  })
}

const wrap = (jsx: string) => `import { signal, splitProps } from '@pyreon/reactivity'
export function App(props) {
  const count = signal(0)
  const [own, rest] = splitProps(props, ['z'])
  const label = props.b + '!'
  return ${jsx}
}`

/** Member spellings and the identifier each is compared against. */
const MEMBER_TAGS = ['m.X', 'a.b.C', 'UI.Button', 'motion.div', 'this.X', 'Ctx.Provider']
const ident = (tag: string) => `Q${tag.replace(/\./g, '_')}`

/** Attribute / child / spread shapes, `T` = the tag. */
const USES: Record<string, string> = {
  'prop pass-through': '<T a={props.b} />',
  'prop expression': '<T a={props.b + 1} />',
  'prop-derived const': '<T a={label} />',
  'signal read': '<T a={count()} />',
  'bare signal': '<T a={count} />',
  'static + handler': '<T a="x" n={1} onClick={() => count.set(1)} />',
  'spread props': '<T {...props} />',
  'spread splitProps rest': '<T {...rest} x={props.b} />',
  'ref + key-like': '<T ref={(el) => el} id={props.id} />',
  'text child': '<T>{props.x}</T>',
  'signal child': '<T>{count()}</T>',
  'sole element child': '<T><div class={props.c}>{count()}</div></T>',
  'two children': '<T><b>{props.x}</b><i>{count()}</i></T>',
  'inside a DOM parent': '<section><T a={props.b} /><span>{count()}</span></section>',
  'nested under another member tag': '<T><T a={props.b}>{props.x}</T></T>',
}

const render = (use: string, tag: string) => {
  // close tag spelled with the same name
  return use.replace(/<T\b/g, `<${tag}`).replace(/<\/T>/g, `</${tag}>`)
}

describe('a member tag compiles exactly like the identifier-bound component (#4368)', () => {
  for (const b of BACKENDS) {
    for (const m of MODES) {
      for (const tag of MEMBER_TAGS) {
        for (const [useName, use] of Object.entries(USES)) {
          it(`${b.name} · ${m.name} · <${tag}> · ${useName}`, () => {
            const id = ident(tag)
            const viaMember = b.run(wrap(render(use, tag)), m)
            const viaIdent = b.run(wrap(render(use, id)), m)
            expect(parseSync('c.tsx', viaMember).errors, viaMember).toEqual([])
            expect(viaMember).toBe(viaIdent.split(id).join(tag))
          })
        }
      }
    }
  }
})

describe('the emitted props are branded, not bare arrows', () => {
  for (const b of BACKENDS) {
    it(`${b.name}: <m.X a={props.b}/> passes _pp, an expression _rp, a signal _rpd`, () => {
      const out = b.run(
        wrap('<div><m.X a={props.b} /><M.X a={props.b + 1} /><m.X a={count()} /></div>'),
        MODES[0]!,
      )
      expect(out).toContain('<m.X a={_pp(props, "b")} />')
      expect(out).toContain('<M.X a={_pk(props, "b") ? (props.b + 1) : _rp(() => props.b + 1)} />')
      expect(out).toContain('<m.X a={_rpd(count)} />')
      expect(out).not.toMatch(/\.X a=\{\(\) =>/)
    })

    it(`${b.name}: a spread onto a member tag keeps its getters (_wrapSpread)`, () => {
      const out = b.run(wrap('<UI.Button {...rest} />'), MODES[0]!)
      expect(out).toContain('<UI.Button {..._wrapSpread(rest)} />')
    })

    it(`${b.name}: a template as the sole child of <Ctx.Provider> is deferred with _lc`, () => {
      const out = b.run(
        wrap('<Ctx.Provider value={1}><div class={props.c}>{count()}</div></Ctx.Provider>'),
        MODES[0]!,
      )
      expect(out).toMatch(/<Ctx\.Provider value=\{1\}>\{_lc\(\(\) => _tpl\(/)
    })

    it(`${b.name}: a namespaced tag (<svg:a>) is not a component`, () => {
      const out = b.run(wrap('<svg:a href={props.h} />'), MODES[0]!)
      expect(out).not.toContain('_pp(')
      expect(out).not.toContain('_rp(')
    })
  }
})

describe('the identifier rule: ASCII lowercase first letter = DOM element, else component', () => {
  const COMPONENT_IDENTS = ['_Foo', '$Foo', '_foo', 'Éa']
  const DOM_IDENTS = ['div', 'my-el', 'svg']
  for (const b of BACKENDS) {
    for (const t of COMPONENT_IDENTS) {
      it(`${b.name}: <${t}> is a component — props branded, never templated`, () => {
        const out = b.run(wrap(`<${t} a={props.b}>{props.x}</${t}>`), MODES[0]!)
        expect(out).toContain(`<${t} a={_pp(props, "b")}>`)
        expect(out).not.toContain('_tpl(')
      })
    }
    for (const t of DOM_IDENTS) {
      it(`${b.name}: <${t}> is a DOM element — templated`, () => {
        const out = b.run(wrap(`<${t} title={props.b}>{props.x}</${t}>`), MODES[0]!)
        expect(out).toContain('_tpl(')
        expect(out).not.toContain('_pp(')
      })
    }
  }
})

describe.skipIf(!nativeTransform)('native emit equals JS for every form and mode', () => {
  const forms = [...MEMBER_TAGS, 'X', '_Foo', '$Foo', 'svg:a']
  for (const m of MODES) {
    for (const tag of forms) {
      for (const [useName, use] of Object.entries(USES)) {
        it(`${m.name} · <${tag}> · ${useName}`, () => {
          const src = wrap(render(use, tag))
          expect(BACKENDS[1]!.run(src, m)).toBe(BACKENDS[0]!.run(src, m))
        })
      }
    }
  }
})

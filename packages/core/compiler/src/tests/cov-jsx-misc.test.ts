/**
 * Branch coverage — `jsx.ts` residual arms: template REF chaining, text-slot
 * placeholders, non-container attribute values, `<For>`/`.map` SSR bails that
 * need an unusual operand, and the collapse option's source overrides.
 */
import { describe, expect, it } from 'vitest'
import { rocketstyleCollapseKey, transformJSX, transformJSX_JS } from '../jsx'

const t = (src: string, o: Record<string, unknown> = {}) => transformJSX_JS(src, 'in.tsx', o).code
const SSR = { ssr: true, ssrTemplate: true } as const
const s = (src: string) => t(src, SSR)
const SIG = 'const count = signal(0)\n'
const SEL = 'const sel = createSelector(cur)\n'

describe('jsx.ts — template element REFS are chained and reused', () => {
  it('walks to a deep sibling with ONE chained ref', () => {
    const out = t('<div><span/><b/><i>{x}</i></div>')
    expect(out).toContain('__root.firstElementChild.nextElementSibling.nextElementSibling')
    expect(out.match(/const __e\d+ =/g)).toHaveLength(1)
  })

  it('REUSES one captured ref across two bindings on the same element', () => {
    const out = t('<div><span/><b id={x} class={y}/></div>')
    expect(out.match(/const __e\d+ =/g)).toHaveLength(1)
    expect(out).toContain('_setAttr(__e0, "id", x)')
    expect(out).toContain('_setClass(__e0, y)')
  })

  it('the ROOT element needs no ref at all', () => {
    const out = t('<div id={x}>t</div>')
    expect(out).not.toContain('const __e0 =')
    expect(out).toContain('_setAttr(__root, "id", x)')
  })
})

describe('jsx.ts — a dynamic text child with a FOLLOWING sibling needs a placeholder', () => {
  it('a selector ternary followed by an element emits `<!>` + `_textSlot`', () => {
    const out = t(`${SEL}export const A = () => <div>{() => sel(k) ? "a" : "b"}<span/></div>`)
    expect(out).toContain('<div><!><span></span></div>')
    expect(out).toContain('_textSlot(__root, __p0)')
  })

  it('the SAME selector ternary as the sole child bakes a text node instead', () => {
    const out = t(`${SEL}export const A = () => <div>{() => sel(k) ? "a" : "b"}</div>`)
    expect(out).toContain('_tpl("<div> </div>"')
    expect(out).not.toContain('_textSlot')
  })

  it('a signal METHOD call followed by an element emits the placeholder too', () => {
    const out = t(`${SIG}export const A = () => <div>{count().toFixed(2)}<span/></div>`)
    expect(out).toContain('_textSlot')
    expect(out).toContain('<!>')
  })

  it('a PROPS read followed by an element emits the placeholder too', () => {
    const out = t('function A(props) { return <div>{props.a}<span/></div> }')
    expect(out).toContain('_textSlot')
  })
})

describe('jsx.ts — attribute values that are NOT expression containers', () => {
  it('a STRING-valued `ref` is ignored (a ref must be an expression)', () => {
    const out = t('<div ref="s">x</div>')
    expect(out).toBe('import { _tpl } from "@pyreon/runtime-dom";\n_tpl("<div>x</div>", () => null)')
  })

  it('a STRING-valued event handler is ignored', () => {
    const out = t('<div onClick="s">x</div>')
    expect(out).not.toContain('__ev_click')
  })

  it('an EXPRESSION-valued ref IS wired', () => {
    expect(t('<div ref={r}>x</div>')).toContain('r')
  })

  it('an EXPRESSION-valued handler IS wired', () => {
    expect(t('<div onClick={f}>x</div>')).toContain('__ev_click = f')
  })

  it('an EMPTY-expression ref is ignored', () => {
    expect(t('<div ref={/* c */}>x</div>')).toContain('_tpl("<div>x</div>", () => null)')
  })

  it('an EMPTY-expression handler is ignored', () => {
    expect(t('<div onClick={/* c */}>x</div>')).not.toContain('__ev_click')
  })
})

describe('jsx.ts (SSR) — operands that keep the h() walk', () => {
  it('a `.map` ROW carrying an entity bails the whole map', () => {
    const out = s('<ul>{items.map((i) => <li>a &amp; b</li>)}</ul>')
    expect(out).toContain('_escSole(items.map(')
    expect(out).not.toContain('_ssrChildren')
  })

  it('the same map WITHOUT the entity lowers', () => {
    expect(s('<ul>{items.map((i) => <li>a b</li>)}</ul>')).toContain('_ssrChildren')
  })

  it('an ARROW-function child keeps its own emission', () => {
    const out = s('<div>{() => x}</div>')
    expect(out).toContain('_escSole(() => x)')
  })

  it('an element-valued CONST child is not re-lowered at its use site', () => {
    const out = s('const el = <span/>\nexport const A = () => <div>{el}</div>')
    expect(out).toContain('const el = _ssr(["<span></span>"])')
    expect(out).toContain('_escSole(el)')
  })

  it('a `<For>` whose prop expression is EMPTY bails', () => {
    const out = s('<ul><For each={/* c */} by={f}>{(i) => <li/>}</For></ul>')
    expect(out).not.toContain('_ssrForKeyed')
  })

  it('a `<For>` callback with ZERO parameters still lowers', () => {
    const out = s('<ul><For each={items} by={(i) => i.id}>{() => <li/>}</For></ul>')
    expect(out).toContain('_ssrForKeyed(items, (i) => i.id, () =>')
  })

  it('an EMPTY `.map` row lowers to a static-only item call', () => {
    const out = s('<ul>{items.map((i) => <li></li>)}</ul>')
    expect(out).toContain('_ssrItem(["<li></li>"])')
  })
})

describe('jsx.ts — `splitProps` destructure shapes', () => {
  it('a NESTED array pattern registers nothing for the inner binding', () => {
    const out = t('function A(props) { const [[a], rest] = splitProps(props, ["a"]); return <div>{a.b}</div> }')
    expect(out).toContain('_setChild(__root, a.b)')
    expect(out).not.toContain('_bindProp(a')
  })

  it('a FLAT array pattern does register', () => {
    const out = t('function A(props) { const [a, rest] = splitProps(props, ["a"]); return <div>{a.b}</div> }')
    expect(out).toContain('_bindProp(a, "b"')
  })
})

describe('jsx.ts — absorbing a MEMBER-tag component child', () => {
  it('a `<Ctx.P/>` child is absorbed (a member tag is a component)', () => {
    const out = t('<div><Ctx.P/></div>', { templatizeComponentChildren: true })
    expect(out).toContain('_mountChild(<Ctx.P/>, __root, null)')
  })

  it('a component followed by TEXT still bails', () => {
    const out = t('<div><Node/>t</div>', { templatizeComponentChildren: true })
    expect(out).toBe('<div><Node/>t</div>')
  })
})

describe('jsx.ts — nested fragments collapse to nothing in the element count', () => {
  it('a fragment inside a fragment still bakes its element', () => {
    expect(t('<div><><><span/></></></div>')).toContain('_tpl("<div><span></span></div>"')
  })
})

describe('jsx.ts — a repeated circular chain warns exactly once', () => {
  it('two uses of the same cycle produce ONE warning', () => {
    const r = transformJSX_JS(
      'function A(props) { const a = b + props.x; const b = a + 1; return <div class={a} id={b} title={a}>x</div> }',
      'in.tsx',
    )
    expect(r.warnings.filter((w) => w.code === 'circular-prop-derived')).toHaveLength(1)
  })
})

describe('jsx.ts — `props.children` under a DOM parent mounts as a slot', () => {
  it('routes through `_mountSlot`, not the text path', () => {
    const out = t('function A(props) { return <div>{props.children}</div> }')
    expect(out).toContain('_mountSlot(() => (props.children)')
    expect(out).not.toContain('_bindProp(props, "children"')
  })

  it('a NON-`children` props read of the same shape takes the descriptor path', () => {
    expect(t('function A(props) { return <div>{props.title}</div> }')).toContain(
      '_bindProp(props, "title"',
    )
  })
})

describe('jsx.ts — the collapse option`s module-source overrides', () => {
  const SITE = {
    templateHtml: '<button>S</button>',
    lightClass: 'L',
    darkClass: 'D',
    rules: ['.L{}'],
    ruleKey: 'k',
  }
  const src = `import { Button } from '@pyreon/ui-components'\nconst a = <Button state="p">S</Button>`
  const key = rocketstyleCollapseKey('Button', { state: 'p' }, 'S')
  const base = {
    candidates: new Set(['Button']),
    sites: new Map([[key, SITE]]),
    mode: { name: 'useMode', source: '@pyreon/ui-core' },
  }

  it('threads a custom `runtimeDomSource` / `stylerSource` through BOTH backends', () => {
    const opts = {
      collapseRocketstyle: { ...base, runtimeDomSource: '@my/dom', stylerSource: '@my/styler' },
    }
    const js = transformJSX_JS(src, 'in.tsx', opts).code
    expect(js).toContain('from "@my/dom"')
    expect(js).toContain('from "@my/styler"')
    // The native backend receives the same overrides and emits the same bytes.
    expect(transformJSX(src, 'in.tsx', opts).code).toBe(js)
  })

  it('falls back to the framework packages when the overrides are absent', () => {
    const opts = { collapseRocketstyle: base }
    const js = transformJSX_JS(src, 'in.tsx', opts).code
    expect(js).toContain('from "@pyreon/runtime-dom"')
    expect(js).toContain('from "@pyreon/styler"')
    expect(transformJSX(src, 'in.tsx', opts).code).toBe(js)
  })
})

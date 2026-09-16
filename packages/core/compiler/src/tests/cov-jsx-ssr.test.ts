/**
 * Branch coverage — `jsx.ts` compile-to-string SSR fast path
 * (`{ ssr: true, ssrTemplate: true }`).
 *
 * The fast path's oracle is BYTE-IDENTITY with the `h()` walk, which a BAIL
 * satisfies trivially — so the existing differential fuzz crosses these lines
 * without asserting that the fast path still FIRES. Every spec here asserts the
 * emitted shape directly: the source that takes an arm, and the neighbouring
 * source that must take the other.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const SSR = { ssr: true, ssrTemplate: true } as const
const s = (src: string) => transformJSX_JS(src, 'in.tsx', SSR).code
const bothAgree = (src: string) => {
  const js = transformJSX_JS(src, 'in.tsx', SSR).code
  expect(transformJSX(src, 'in.tsx', SSR).code).toBe(js)
  return js
}
/** The fast path fired iff an `_ssr([…])` call replaced the JSX. */
const lowered = (src: string) => s(src).includes('_ssr([')

describe('jsx.ts (SSR) — attributes rendered as NOTHING server-side', () => {
  it('drops `ref` from the baked tag', () => {
    const out = bothAgree('<div ref={r}>x</div>')
    expect(out).toContain('_ssr(["<div>x</div>"])')
    expect(out).not.toContain('ref')
  })

  it('drops `key` from the baked tag', () => {
    expect(s('<div key="k">x</div>')).toContain('_ssr(["<div>x</div>"])')
  })

  it('drops an `on*` handler from the baked tag', () => {
    expect(s('<div onClick={f}>x</div>')).toContain('_ssr(["<div>x</div>"])')
  })

  it('a NON-skipped attribute of the same element IS baked', () => {
    expect(s('<div id="k">x</div>')).toContain('<div id=\\"k\\">x</div>')
  })
})

describe('jsx.ts (SSR) — shapes that BAIL the whole element to h()', () => {
  it('`innerHTML` / `dangerouslySetInnerHTML` are inner CONTENT, not attrs → bail', () => {
    expect(lowered('<div innerHTML={h}>x</div>')).toBe(false)
    expect(lowered('<div dangerouslySetInnerHTML={h} />')).toBe(false)
  })

  it('`<textarea value>` bails — the value is TEXT CONTENT, the attribute is dead (PZ-09)', () => {
    expect(lowered('<div><textarea value={v} /></div>')).toBe(false)
  })

  it('a `<textarea>` WITHOUT a value still lowers', () => {
    expect(lowered('<div><textarea rows={2} /></div>')).toBe(true)
  })

  it('an EMPTY expression-container attribute bails', () => {
    expect(lowered('<div title={/* c */}>x</div>')).toBe(false)
  })

  it('a SPREAD attribute bails', () => {
    expect(lowered('<div {...p}>x</div>')).toBe(false)
  })

  it('a raw JSX string attribute carrying `&` bails (oxc keeps the entity, esbuild may decode it)', () => {
    expect(lowered('<div title="a &amp; b">x</div>')).toBe(false)
    // …but the JS-string form is unaffected — JS literals never HTML-decode.
    expect(lowered('<div title={"a & b"}>x</div>')).toBe(true)
  })

  it('JSX TEXT carrying `&` bails for the same reason', () => {
    expect(lowered('<div>a &amp; b</div>')).toBe(false)
    expect(lowered('<div>a b</div>')).toBe(true)
  })
})

describe('jsx.ts (SSR) — valueless (boolean) attributes', () => {
  it('a lowercase boolean attribute bakes BARE', () => {
    const out = bothAgree('<div><input disabled /></div>')
    expect(out).toContain('<input disabled />')
  })

  it('a valueless ARIA attribute bakes as `="true"`, not bare', () => {
    const out = s('<div aria-hidden>x</div>')
    expect(out).toContain('aria-hidden=\\"true\\"')
  })

  it('a valueless camelCase attribute goes through `_ssrAttr` (renderProp owns the name map)', () => {
    const out = s('<div><input readOnly /></div>')
    expect(out).toContain('_ssrAttr("input", "readOnly", true)')
    expect(out).not.toContain('<input readOnly')
  })
})

describe('jsx.ts (SSR) — the aria prefix test is a fast char check, not a substring scan', () => {
  it('`aria-label` is recognised as aria (routed to `_ssrAttr`, never `_ssrAttrGen`)', () => {
    const out = s('<div aria-label={l}>x</div>')
    expect(out).toContain('_ssrAttr("div", "aria-label", l)')
    expect(out).not.toContain('_ssrAttrGen')
  })

  it('`alt` starts with the same char but is NOT aria — it takes the generic helper', () => {
    const out = s('<div><img alt={a} /></div>')
    expect(out).toContain('_ssrAttrGen("alt", a)')
    expect(out).not.toContain('_ssrAttr("img"')
  })

  it('a non-`a` name also takes the generic helper', () => {
    expect(s('<div id={i}>x</div>')).toContain('_ssrAttrGen("id", i)')
  })
})

describe('jsx.ts (SSR) — literal attribute values through ssrBakeStringAttr', () => {
  it('bakes `class=""` (CSR parity — the client materialises an empty class)', () => {
    expect(s('<div class="">x</div>')).toContain('class=\\"\\"')
  })

  it('OMITS `style=""` (normalizeStyle("") is empty)', () => {
    const out = s('<div style="">x</div>')
    expect(out).toContain('_ssr(["<div>x</div>"])')
    expect(out).not.toContain('style')
  })

  it('bakes a NON-empty style string', () => {
    expect(s('<div style="color:red">x</div>')).toContain('style=\\"color:red\\"')
  })

  it('a `javascript:` URL literal is NOT baked — it routes to the url guard helper', () => {
    const out = s('<div><a href={"javascript:x"}>l</a></div>')
    expect(out).toContain('_ssrAttrUrl("a", "href", "javascript:x")')
    expect(out).not.toContain('href=\\"javascript:x\\"')
  })

  it('a SAFE URL literal IS baked into the tag', () => {
    const out = s('<div><a href={"/safe"}>l</a></div>')
    expect(out).toContain('href=\\"/safe\\"')
    expect(out).not.toContain('_ssrAttrUrl')
  })

  it('a `javascript:` URL hidden behind scheme noise is ALSO refused', () => {
    // The browser strips ASCII controls before resolving the scheme, so the
    // bare regex alone would read `java\tscript:` as safe.
    const out = s('<div><a href={"java\\tscript:alert(1)"}>l</a></div>')
    expect(out).toContain('_ssrAttrUrl')
  })

  it('bakes a numeric literal expression attribute', () => {
    expect(s('<div id={7}>x</div>')).toContain('id=\\"7\\"')
  })

  it('a numeric literal on a URL attribute is NOT baked as a number', () => {
    expect(s('<div><a href={7}>l</a></div>')).toContain('_ssrAttr')
  })

  it('bakes `attr={true}` bare, and `aria-x={true}` as `="true"`', () => {
    expect(s('<div><input disabled={true} /></div>')).toContain('<input disabled />')
    expect(s('<div aria-hidden={true}>x</div>')).toContain('aria-hidden=\\"true\\"')
  })

  it('omits `attr={false}` / `{null}` / `{undefined}`', () => {
    for (const v of ['false', 'null', 'undefined']) {
      expect(s(`<div><input disabled={${v}} /></div>`)).toContain('_ssr(["<div><input /></div>"])')
    }
  })
})

describe('jsx.ts (SSR) — proven-non-null dynamic attrs bake `name="` + `_esc(v)` + `"`', () => {
  it('bakes a `+` concat whose operands are BOTH provable', () => {
    const out = bothAgree('<div id={"a" + 1}>x</div>')
    expect(out).toContain('_esc("a" + 1)')
    expect(out).toContain('<div id=\\"')
  })

  it('bakes a numeric `+` concat (neither side a string, both non-null)', () => {
    expect(s('<div id={1 + 2}>x</div>')).toContain('_esc(1 + 2)')
  })

  it('does NOT bake a `+` concat with an UNPROVABLE operand', () => {
    const out = s('<div id={1 + x}>x</div>')
    expect(out).toContain('_ssrAttrGen("id", 1 + x)')
    expect(out).not.toContain('_esc(')
  })

  it('bakes a ternary whose BOTH arms are provable', () => {
    expect(s('<div id={c ? "a" : "b"}>x</div>')).toContain('_esc(c ? "a" : "b")')
  })

  it('does NOT bake a ternary with ONE unprovable arm', () => {
    expect(s('<div id={c ? "a" : z}>x</div>')).toContain('_ssrAttrGen')
  })

  it('bakes `String(x)` and `Number(x)` coercions', () => {
    expect(s('<div id={String(x)}>y</div>')).toContain('_esc(String(x))')
    expect(s('<div id={Number(x)}>y</div>')).toContain('_esc(Number(x))')
  })

  it('declines EVERY method call — a name on an untyped receiver proves nothing', () => {
    // `n.toFixed(2)` used to bake; a user object's `toFixed`/`join` returning
    // null then baked `id="null"` where the h() path omits (audit round 2).
    expect(s('<div id={n.toFixed(2)}>y</div>')).toContain('_ssrAttrGen')
    expect(s('<div id={n.whatever()}>y</div>')).toContain('_ssrAttrGen')
  })

  it('does NOT bake a class/style dynamic value (renderProp owns normalisation)', () => {
    expect(s('<div class={"a" + b}>x</div>')).toContain('_ssrAttr("div", "class"')
    expect(s('<div style={"a" + b}>x</div>')).toContain('_ssrAttr("div", "style"')
  })
})

describe('jsx.ts (SSR) — URL attrs additionally require a provably-SAFE start', () => {
  it('bakes a template-literal URL whose first quasi starts safe', () => {
    const out = bothAgree('<div><a href={`/x${y}`}>l</a></div>')
    expect(out).toContain('href=\\"')
    expect(out).toContain('_esc(`/x${y}`)')
  })

  it('does NOT bake a template-literal URL that starts with an INTERPOLATION', () => {
    expect(s('<div><a href={`${y}/x`}>l</a></div>')).toContain('_ssrAttrUrl')
  })

  it('does NOT bake a template-literal URL starting with `j` (the `javascript:` prefix char)', () => {
    expect(s('<div><a href={`j${y}`}>l</a></div>')).toContain('_ssrAttrUrl')
  })

  it('bakes a `+` concat URL whose LEFT side starts safe', () => {
    expect(s('<div><a href={"/x" + y}>l</a></div>')).toContain('_esc("/x" + y)')
  })

  it('does NOT bake a `+` concat URL whose left side is unprovable', () => {
    expect(s('<div><a href={y + "/x"}>l</a></div>')).toContain('_ssrAttrUrl')
  })

  it('bakes a ternary URL when BOTH arms start safe, and declines when one does not', () => {
    expect(s('<div><a href={c ? "/a" : "/b"}>l</a></div>')).toContain('_esc(c ? "/a" : "/b")')
    expect(s('<div><a href={c ? "/a" : "data:x"}>l</a></div>')).toContain('_ssrAttrUrl')
  })

  it('does NOT bake an EMPTY-string URL literal (no first char to prove)', () => {
    expect(s('<div><a href={""}>l</a></div>')).not.toContain('_esc(')
  })
})

describe('jsx.ts (SSR) — `.map(cb => <el/>)` child lowering and its bails', () => {
  it('lowers a concise-arrow map to `_ssrChildren` + a per-item builder', () => {
    const out = bothAgree('<ul>{items.map((i) => <li>{i}</li>)}</ul>')
    expect(out).toContain('_ssrChildren(items.map(')
    expect(out).toContain('"<li>"')
  })

  it('does NOT lower a BLOCK-bodied map callback', () => {
    const out = s('<ul>{items.map((i) => { return <li /> })}</ul>')
    expect(out).not.toContain('_ssrChildren')
    expect(out).toContain('_escSole')
  })

  it('does NOT lower a map whose callback is not an ARROW', () => {
    expect(s('<ul>{items.map(function (i) { return 1 })}</ul>')).not.toContain('_ssrChildren')
  })

  it('does NOT lower a map called with TWO arguments', () => {
    expect(s('<ul>{items.map(cb, thisArg)}</ul>')).not.toContain('_ssrChildren')
  })

  it('does NOT lower a map whose callback body is NOT a JSX element', () => {
    expect(s('<ul>{items.map((i) => i)}</ul>')).not.toContain('_ssrChildren')
  })

  it('does NOT lower a non-`map` method call child', () => {
    expect(s('<ul>{items.filter((i) => <li />)}</ul>')).not.toContain('_ssrChildren')
  })

  it('does NOT lower a map whose ITEM element is itself ineligible', () => {
    // A spread inside the row bails `buildSsrBuf`, so the whole map declines.
    expect(s('<ul>{items.map((i) => <li {...i} />)}</ul>')).not.toContain('_ssrChildren')
  })
})

describe('jsx.ts (SSR) — keyed `<For>` child lowering and its bails', () => {
  const FOR = '<ul><For each={items} by={(i) => i.id}>{(i) => <li>{i.n}</li>}</For></ul>'

  it('lowers an exact `<For each by>{arrow => el}</For>` child to `_ssrForKeyed`', () => {
    const out = bothAgree(FOR)
    expect(out).toContain('_ssrForKeyed(items, (i) => i.id,')
  })

  it('does NOT lower a `<For>` carrying an EXTRA prop', () => {
    expect(s('<ul><For each={items} by={(i) => i.id} fallback={<p />}>{(i) => <li />}</For></ul>'))
      .not.toContain('_ssrForKeyed')
  })

  it('does NOT lower a `<For>` with a SPREAD attribute', () => {
    expect(s('<ul><For {...p}>{(i) => <li />}</For></ul>')).not.toContain('_ssrForKeyed')
  })

  it('does NOT lower a `<For>` missing `by`', () => {
    expect(s('<ul><For each={items}>{(i) => <li />}</For></ul>')).not.toContain('_ssrForKeyed')
  })

  it('does NOT lower a `<For>` whose prop value is a plain STRING (not an expression)', () => {
    expect(s('<ul><For each="x" by={(i) => i}>{(i) => <li />}</For></ul>')).not.toContain(
      '_ssrForKeyed',
    )
  })

  it('does NOT lower a `<For>` with more than one meaningful child', () => {
    expect(s('<ul><For each={items} by={(i) => i.id}>{(i) => <li />}<p /></For></ul>'))
      .not.toContain('_ssrForKeyed')
  })

  it('does NOT lower a `<For>` whose child is an ELEMENT rather than a callback', () => {
    expect(s('<ul><For each={items} by={(i) => i.id}><li /></For></ul>')).not.toContain(
      '_ssrForKeyed',
    )
  })

  it('does NOT lower a `<For>` whose callback is BLOCK-bodied', () => {
    expect(s('<ul><For each={items} by={(i) => i.id}>{(i) => { return <li /> }}</For></ul>'))
      .not.toContain('_ssrForKeyed')
  })

  it('does NOT lower a `<For>` whose callback body is not a JSX element', () => {
    expect(s('<ul><For each={items} by={(i) => i.id}>{(i) => i}</For></ul>')).not.toContain(
      '_ssrForKeyed',
    )
  })

  it('does NOT lower a `<For>` whose callback is not an arrow', () => {
    expect(s('<ul><For each={items} by={(i) => i.id}>{fn}</For></ul>')).not.toContain(
      '_ssrForKeyed',
    )
  })

  it('tolerates whitespace-only text around the callback child', () => {
    const out = s(`<ul><For each={items} by={(i) => i.id}>
      {(i) => <li>{i.n}</li>}
    </For></ul>`)
    expect(out).toContain('_ssrForKeyed')
  })
})

describe('jsx.ts (SSR) — conditional ELEMENT children lower to a nested `_ssr`', () => {
  it('lowers the right operand of `&&`', () => {
    const out = bothAgree('<div>{c && <span>y</span>}</div>')
    expect(out).toContain('c && _ssr(["<span>y</span>"])')
  })

  it('does NOT lower an `&&` whose right operand is not an element', () => {
    const out = s('<div>{c && v}</div>')
    expect(out).toContain('_escSole(c && v)')
    expect(out).not.toContain('&& _ssr([')
  })

  it('lowers BOTH arms of a ternary of elements', () => {
    const out = s('<div>{c ? <span>a</span> : <b>b</b>}</div>')
    expect(out).toContain('_ssr(["<span>a</span>"]) : _ssr(["<b>b</b>"])')
  })

  it('lowers only the CONSEQUENT when the alternate is not an element', () => {
    const out = s('<div>{c ? <span>a</span> : null}</div>')
    expect(out).toContain('_ssr(["<span>a</span>"]) : null')
  })

  it('lowers only the ALTERNATE when the consequent is not an element', () => {
    const out = s('<div>{c ? null : <b>b</b>}</div>')
    expect(out).toContain('null : _ssr(["<b>b</b>"])')
  })

  it('leaves a ternary of NON-elements alone', () => {
    const out = s('<div>{c ? a : b}</div>')
    expect(out).toContain('_escSole(c ? a : b)')
    expect(out).not.toContain(': _ssr([')
  })

  it('does NOT lower a conditional element that is itself INELIGIBLE', () => {
    const out = s('<div>{c && <span {...p} />}</div>')
    expect(out).not.toContain('&& _ssr([')
  })
})

describe('jsx.ts (SSR) — escaping mirrors runtime-server byte-for-byte', () => {
  it('escapes all five of `& < > " \'` in a baked attribute value', () => {
    const out = s(`<div title={"a<b>c&d\\"e'f"}>x</div>`)
    expect(out).toContain('&lt;')
    expect(out).toContain('&gt;')
    expect(out).toContain('&amp;')
    expect(out).toContain('&quot;')
    expect(out).toContain('&#39;')
  })

  it('leaves an unescaped-safe value byte-identical', () => {
    expect(s('<div title={"plain"}>x</div>')).toContain('title=\\"plain\\"')
  })
})

describe('jsx.ts (SSR) — `ssrTemplate` is gated on `ssr`', () => {
  it('`ssrTemplate` alone (without `ssr`) does NOT lower', () => {
    expect(transformJSX_JS('<div>x</div>', 'in.tsx', { ssrTemplate: true }).code).not.toContain(
      '_ssr(',
    )
  })

  it('`ssr` alone (without `ssrTemplate`) does NOT lower', () => {
    const out = transformJSX_JS('<div>x</div>', 'in.tsx', { ssr: true }).code
    expect(out).not.toContain('_ssr(')
    expect(out).not.toContain('_tpl(')
  })
})

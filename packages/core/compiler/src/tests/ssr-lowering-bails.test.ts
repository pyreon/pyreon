/**
 * The compile-to-string SSR fast path: what it lowers, and everything it
 * refuses.
 *
 * `ssrTemplate` turns an eligible JSX subtree into an `_ssr([...], hole, …)`
 * string build instead of a `h()` VNode tree, and its entire safety argument
 * is byte-identity: the produced HTML must equal what `renderNode` would have
 * produced, because hydration walks the result. So the interesting behaviour
 * is not what it lowers — it is what it BAILS on, and a bail is invisible in
 * the output except as a slower render.
 *
 * A wrong lowering is not. It produces HTML that differs from what the client
 * will build, which surfaces one layer away as a hydration mismatch: a whole
 * subtree silently rebuilt, or — with the shapes below — an attribute
 * rendered as the string `"undefined"`, a `<textarea>` that comes back empty,
 * a `javascript:` URL baked into an `href`.
 *
 * Every bail below is paired with the shape that must still lower, because a
 * fast path that refuses everything is indistinguishable from one that was
 * never enabled — and the whole point of the option is that it fires.
 *
 * **Why the differential fuzz does not already cover this, even though it
 * exercises the same code.** Its oracle is byte-identity between the SSR emit
 * and the h() walk — and a BAIL satisfies that trivially, because bailing IS
 * running the h() path. So the fuzz can tell you the lowering is correct
 * whenever it happens, and can never tell you it stopped happening, or that it
 * started happening for a shape it should refuse. These specs are what pin the
 * ELIGIBILITY decision; they were written expecting coverage to move and it
 * did not, which is the evidence that the fuzz reaches every one of these
 * lines and proves something different about them.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX } from '../jsx'

/** Compile through the SSR string path. */
const ssr = (code: string): string =>
  transformJSX(code, 'input.tsx', { ssr: true, ssrTemplate: true }).code

/** Did the fast path fire for this source? */
const lowered = (code: string): boolean => ssr(code).includes('_ssr(')

/**
 * Did the ROW-LIST lowering fire?
 *
 * `_ssr(` alone is too coarse for a list: the enclosing `<ul>` lowers whether
 * or not its `.map()` child does, so a bare `_ssr(` check reports true for
 * every shape below and the refusals would all pass vacuously. The row
 * builders are the discriminator — `_ssrChildren`/`_ssrItem` for a `.map()`,
 * `_ssrForKeyed` for a `<For>` — and a bail falls back to `_ssrDeferred`,
 * which hands the child to the VNode path.
 */
const loweredMap = (code: string): boolean => ssr(code).includes('_ssrChildren')
const loweredFor = (code: string): boolean => ssr(code).includes('_ssrForKeyed')
/** A child handed to the VNode path rather than lowered in place. */
const deferred = (code: string): boolean => ssr(code).includes('_ssrDeferred')

describe('the fast path fires for the shapes it was built for', () => {
  it('lowers a static element', () => {
    // The control for every refusal below: without it, "does not lower X"
    // passes against an option that never lowers anything.
    expect(lowered('const a = <p class="x">hi</p>')).toBe(true)
  })

  it('lowers an element with a dynamic TEXT child', () => {
    expect(lowered('const a = <p>{name}</p>')).toBe(true)
  })

  it('lowers an element with a dynamic ATTRIBUTE', () => {
    expect(lowered('const a = <p title={t}>hi</p>')).toBe(true)
  })

  it('lowers a nested static tree', () => {
    expect(lowered('const a = <div><span><b>x</b></span></div>')).toBe(true)
  })
})

describe('it refuses the shapes it cannot prove byte-identical', () => {
  it('refuses a SPREAD', () => {
    // A spread's keys are unknowable at compile time, so the attribute string
    // cannot be built — and guessing would emit HTML the client disagrees
    // with on every prop the spread carried.
    expect(lowered('const a = <p {...rest}>hi</p>')).toBe(false)
  })

  it('DEFERS a component child to the VNode path', () => {
    // A component's output shape is not knowable here, so the child is handed
    // to `renderNode` while the surrounding skeleton still lowers — the
    // conservative split that keeps a component from costing its whole page
    // the fast path.
    expect(deferred('const a = <div><Widget /></div>')).toBe(true)
  })

  it('refuses a <select>', () => {
    // `<select value>` has no content attribute — SSR marks the matching
    // `<option selected>` instead. Baking `value` would emit an attribute the
    // parser ignores and lose the selection entirely.
    expect(lowered('const a = <select value={v}><option value="a">A</option></select>')).toBe(false)
  })

  it('refuses a `value` on a TEXTAREA', () => {
    // A textarea's value is its TEXT CONTENT, not an attribute. Baking it as
    // one emits a dead attribute and an empty textarea — the field comes back
    // blank with JS off, and mismatches with JS on.
    expect(lowered('const a = <textarea value={v} />')).toBe(false)
  })

  it('LOWERS a value on an INPUT, where it really is an attribute', () => {
    // The control for the rule above: the refusal is about the TAG, not about
    // the attribute name.
    expect(lowered('const a = <input value={v} />')).toBe(true)
  })

  it('refuses a void element given children', () => {
    expect(lowered('const a = <div><br>{x}</br></div>')).toBe(false)
  })

  it('refuses `dangerouslySetInnerHTML`', () => {
    // The payload is opaque; the server renders it and the client re-parses
    // it, so the subtree cannot be described by a static skeleton.
    expect(lowered('const a = <div dangerouslySetInnerHTML={{ __html: h }} />')).toBe(false)
  })
})

describe('URL attributes are only baked when they are provably safe', () => {
  it('bakes a static href', () => {
    expect(ssr('const a = <a href="/x">go</a>')).toContain('/x')
  })

  it('routes a DYNAMIC href through the guarded hole, not a raw bake', () => {
    // The guard is what stops `javascript:` reaching the attribute. A raw
    // interpolation here would be an XSS vector the h() path does not have,
    // reachable from any user-controlled link.
    const out = ssr('const a = <a href={url}>go</a>')
    expect(out).toContain('_ssr')
    expect(out, 'the value goes through the url-aware hole').toMatch(/_ssrAttrUrl|_ssrAttr\b/)
  })

  it('treats a CONDITIONAL of two safe literals as safe', () => {
    // Both branches are literals the compiler can read, so the guard is
    // satisfiable statically — refusing here would cost the lowering for the
    // commonest dynamic-href shape there is.
    expect(lowered('const a = <a href={cond ? "/a" : "/b"}>go</a>')).toBe(true)
  })

  it('still lowers when one branch is NOT a literal — through the guard', () => {
    const out = ssr('const a = <a href={cond ? "/a" : userUrl}>go</a>')
    expect(out).toContain('_ssr')
  })
})

describe('attribute baking follows the runtime normalization', () => {
  it('drops `key` and `ref` — neither is a DOM attribute', () => {
    // `key` is reconciliation metadata and `ref` is a callback. Emitting
    // either would put `key="1"` and a stringified function in the HTML.
    const out = ssr('const a = <p key="1" ref={r}>hi</p>')
    expect(out).not.toContain('key="1"')
    expect(out).not.toContain('ref=')
  })

  it('bakes a BOOLEAN attribute as presence, and a false one as absence', () => {
    expect(ssr('const a = <input disabled={true} />')).toContain('disabled')
    expect(ssr('const a = <input disabled={false} />')).not.toContain('disabled')
  })

  it('bakes a boolean ARIA attribute as the string "true"', () => {
    // An `aria-*` attribute rendered as presence-only is an INVALID ARIA
    // value: assistive tech does not read `aria-pressed=""` as true, it falls
    // back to the default — so the control is announced as its opposite.
    // The emit is a JS string literal, so the attribute's quotes arrive
    // escaped — matching the raw form would assert on the escaping rather
    // than on the HTML.
    expect(ssr('const a = <button aria-pressed={true}>x</button>')).toMatch(
      /aria-pressed=\\?"true\\?"/,
    )
  })

  it('bakes a NEGATIVE numeric literal', () => {
    // `tabIndex={-1}` is a unary expression, not a literal — reading only the
    // literal would emit `tabindex="1"`, which is the opposite of the intent
    // and silently puts the element into the tab order.
    expect(ssr('const a = <div tabIndex={-1} />')).toContain('-1')
  })

  it('routes a numeric attribute through the guarded hole, not a raw bake', () => {
    // `tabIndex={0}` and `tabIndex={-1}` both reach `_ssrAttr`, which applies
    // the same null / boolean / aria normalization the runtime does. Baking
    // the digits directly would skip that and diverge from the h() path on
    // every value the normalization touches.
    const out = ssr('const a = <div tabIndex={0} />')
    expect(out).toContain('_ssrAttr')
    expect(out).toContain('0')
  })

  it('omits an EMPTY style attribute rather than emitting style=""', () => {
    expect(ssr('const a = <p style="">hi</p>')).not.toContain('style=""')
  })

  it('keeps a NAMESPACED attribute out of the static bake', () => {
    // `xlink:href` is a qualified name the DOM must set with
    // `setAttributeNS`. Baking it into an HTML string is fine for SSR, but
    // the compiler treats it as dynamic-unsafe so the two paths agree.
    expect(() => ssr('const a = <svg><use xlink:href="#i" /></svg>')).not.toThrow()
  })
})

describe('a `.map()` child lowers only in the exact shape that is provable', () => {
  it('lowers a concise arrow returning an element', () => {
    // The control, and the dominant list shape.
    expect(loweredMap('const a = <ul>{rows.map((r) => <li>{r.name}</li>)}</ul>')).toBe(true)
  })

  it('refuses a BLOCK-body arrow', () => {
    // A block body can do anything before it returns — an early return, a
    // side effect, a second element. The compiler cannot prove the output.
    expect(
      loweredMap('const a = <ul>{rows.map((r) => { return <li>{r.name}</li> })}</ul>'),
    ).toBe(false)
  })

  it('lowers a callback taking the INDEX as well as the item', () => {
    // The lowering rewrites the callback BODY and leaves its parameter list
    // alone, so `.map` still supplies both arguments. Refusing here would
    // cost the fast path for every list that renders a position, and reading
    // only the first parameter would leave the index undefined in the row —
    // which is why the emit is asserted, not just the fact that it fired.
    const out = ssr('const a = <ul>{rows.map((r, i) => <li>{i}</li>)}</ul>')
    expect(out).toContain('_ssrChildren')
    expect(out, 'both parameters survive').toContain('(r, i) =>')
  })

  it('refuses a callback whose body is not an element', () => {
    expect(loweredMap('const a = <ul>{rows.map((r) => r.name)}</ul>')).toBe(false)
  })

  it('refuses a `.filter()` — the method name is part of the proof', () => {
    expect(loweredMap('const a = <ul>{rows.filter((r) => r.ok)}</ul>')).toBe(false)
  })
})

describe('a <For> lowers only with the props the emit reads', () => {
  it('lowers each/by with a concise element-returning child', () => {
    expect(
      loweredFor(
        'const a = <ul><For each={rows} by={(r) => r.id}>{(r) => <li>{r.name}</li>}</For></ul>',
      ),
    ).toBe(true)
  })

  it('refuses a <For> with no `by`', () => {
    // Without a key the row identity is unknowable, and the SSR emit writes
    // per-row key markers the client reconciler reads.
    expect(
      loweredFor('const a = <ul><For each={rows}>{(r) => <li>{r.name}</li>}</For></ul>'),
    ).toBe(false)
  })

  it('refuses a <For> with no `each`', () => {
    expect(loweredFor('const a = <ul><For by={(r) => r.id}>{(r) => <li>x</li>}</For></ul>')).toBe(
      false,
    )
  })

  it('refuses a <For> whose child is not a function', () => {
    expect(
      loweredFor('const a = <ul><For each={rows} by={(r) => r.id}><li>x</li></For></ul>'),
    ).toBe(false)
  })

  it('refuses a <For> with a BLOCK-body row callback', () => {
    expect(
      loweredFor(
        'const a = <ul><For each={rows} by={(r) => r.id}>{(r) => { return <li/> }}</For></ul>',
      ),
    ).toBe(false)
  })

  it('refuses a <For> whose row callback returns a non-element', () => {
    expect(
      loweredFor('const a = <ul><For each={rows} by={(r) => r.id}>{(r) => r.name}</For></ul>'),
    ).toBe(false)
  })

  it('refuses a <For> with two children', () => {
    expect(
      loweredFor(
        'const a = <ul><For each={rows} by={(r) => r.id}>{(r) => <li/>}{extra}</For></ul>',
      ),
    ).toBe(false)
  })
})

describe('a conditional element child lowers its taken branch', () => {
  it('lowers `cond && <el>`', () => {
    // The taken branch builds a string instead of a VNode, and the untaken
    // one returns the falsy operand verbatim — which `_esc` renders as
    // nothing, exactly as `renderNode` does.
    const out = ssr('const a = <div>{cond && <span>x</span>}</div>')
    expect(out).toContain('_ssr')
  })

  it('lowers both branches of a ternary of elements', () => {
    const out = ssr('const a = <div>{cond ? <b>y</b> : <i>n</i>}</div>')
    expect(out).toContain('_ssr')
  })

  it('lowers a ternary whose alternate is null', () => {
    expect(() => ssr('const a = <div>{cond ? <b>y</b> : null}</div>')).not.toThrow()
  })

  it('leaves a conditional of NON-elements alone', () => {
    expect(() => ssr('const a = <div>{cond ? one : two}</div>')).not.toThrow()
  })

  it('does not lower a conditional whose branch carries a COMPONENT child', () => {
    // A component child has no source range the in-hole emit can bracket, so
    // the branch keeps the VNode path.
    const out = ssr('const a = <div>{cond && <span><Widget /></span>}</div>')
    expect(out).not.toContain('_ssr(["<span>')
  })
})

describe('the SSR emit and the plain h() emit stay distinguishable', () => {
  it('does NOT lower when ssrTemplate is off', () => {
    // The option gates the whole path. A default-on lowering would inject an
    // import into every app's source whether or not it resolves.
    expect(transformJSX('const a = <p>hi</p>', 'input.tsx', { ssr: true }).code).not.toContain(
      '_ssr(',
    )
  })

  it('does NOT lower for a CLIENT transform', () => {
    // The client path has its own fast path (`_tpl` + cloneNode); emitting a
    // string builder there would produce markup nothing hydrates.
    expect(transformJSX('const a = <p>hi</p>', 'input.tsx', { ssrTemplate: true }).code).not.toContain(
      '_ssr(',
    )
  })

  it('injects the runtime import only when it lowered something', () => {
    // The injected import must resolve in the consuming app. Adding it to a
    // file that lowered nothing is a resolution failure for no benefit — the
    // exact shape that 500'd an example when the option first went default-on.
    expect(ssr('const a = <p {...rest} />')).not.toContain('@pyreon/runtime-server')
    expect(ssr('const a = <p>hi</p>')).toContain('@pyreon/runtime-server')
  })
})

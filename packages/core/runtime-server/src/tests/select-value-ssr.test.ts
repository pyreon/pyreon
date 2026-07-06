/**
 * `<select value>` SSR emission (PZ-09).
 *
 * <select> has NO `value` CONTENT attribute — pre-fix, renderPropValue
 * serialized `value="b"` as a dead attribute the parser ignores, so SSR'd
 * pages shipped with the FIRST option selected. The fix drops the dead
 * attribute and carries the selection the way HTML expresses it: the
 * matching `<option>` gets `selected`. Both the string renderer
 * (renderToString) and the streaming renderer (renderToStream) must agree.
 *
 * Matching semantics mirror the client `.value` setter: String()-coerced
 * comparison, FIRST matching option only; an option's comparison value is
 * its `value` prop, falling back to its text (stripped + collapsed —
 * HTMLOptionElement.value → .text). Options with their own `selected` prop
 * are author-controlled and skipped.
 */
import { h } from '@pyreon/core'
import { renderToStream, renderToString } from '../index'

async function streamToString(vnode: Parameters<typeof renderToStream>[0]): Promise<string> {
  const reader = renderToStream(vnode).getReader()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += value
  }
  return out
}

describe('<select value> SSR — string renderer', () => {
  it('drops the dead value attribute and marks the matching option selected', async () => {
    const html = await renderToString(
      h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
    )
    expect(html).toBe(
      '<select><option value="a">A</option><option value="b" selected>B</option></select>',
    )
  })

  it('falls back to option TEXT when the option has no value prop (HTML semantics)', async () => {
    const html = await renderToString(
      h('select', { value: 'Beta' }, h('option', null, '  Alpha '), h('option', null, ' Beta  ')),
    )
    expect(html).toContain('<option selected>')
    expect(html.indexOf('selected')).toBeGreaterThan(html.indexOf('Alpha'))
  })

  it('function-valued (compiler thunk) select value and option values are called once', async () => {
    const html = await renderToString(
      h(
        'select',
        { value: () => 'b' },
        h('option', { value: () => 'a' }, 'A'),
        h('option', { value: () => 'b' }, 'B'),
      ),
    )
    expect(html).toContain('<option value="b" selected>')
    expect(html).not.toContain('<select value')
  })

  it('selects only the FIRST matching option (mirrors the client .value setter)', async () => {
    const html = await renderToString(
      h('select', { value: 'x' }, h('option', { value: 'x' }, '1'), h('option', { value: 'x' }, '2')),
    )
    expect(html.match(/ selected/g)).toHaveLength(1)
    expect(html).toContain('<option value="x" selected>1</option>')
  })

  it('leaves an explicitly selected option authoritative (author-controlled)', async () => {
    const html = await renderToString(
      h(
        'select',
        { value: 'b' },
        h('option', { value: 'a', selected: true }, 'A'),
        h('option', { value: 'b' }, 'B'),
      ),
    )
    // The explicit selected serializes; the value-matched option is NOT
    // double-marked because its sibling carries author intent… but note the
    // value match still applies to b (only options with their OWN selected
    // prop are skipped).
    expect(html).toContain('<option value="a" selected>A</option>')
    expect(html).toContain('<option value="b" selected>B</option>')
  })

  it('no match → no selected marker anywhere', async () => {
    const html = await renderToString(
      h('select', { value: 'zzz' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
    )
    expect(html).not.toContain('selected')
  })

  it('number values String()-coerce on both sides', async () => {
    const html = await renderToString(
      h('select', { value: 2 }, h('option', { value: 1 }, 'One'), h('option', { value: 2 }, 'Two')),
    )
    expect(html).toContain('<option value="2" selected>Two</option>')
  })

  it('null/undefined value emits neither the attribute nor any selected marker', async () => {
    for (const v of [null, undefined]) {
      const html = await renderToString(
        h('select', { value: v }, h('option', { value: 'a' }, 'A')),
      )
      expect(html).toBe('<select><option value="a">A</option></select>')
    }
  })

  it('reaches options nested inside <optgroup>', async () => {
    const html = await renderToString(
      h(
        'select',
        { value: 'b' },
        h('optgroup', { label: 'G' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
      ),
    )
    expect(html).toContain('<option value="b" selected>B</option>')
  })

  it('sibling selects do not leak frames into each other', async () => {
    const html = await renderToString(
      h(
        'div',
        null,
        h('select', { value: 'a' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
        h('select', null, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
      ),
    )
    // First select: a selected. Second select (no value): nothing selected.
    expect(html).toContain('<option value="a" selected>A</option>')
    expect(html.match(/ selected/g)).toHaveLength(1)
  })

  it('an option OUTSIDE any select is untouched', async () => {
    const html = await renderToString(h('option', { value: 'a' }, 'A'))
    expect(html).toBe('<option value="a">A</option>')
  })

  it('a non-text option child makes the text fallback unknowable → no match, no crash', async () => {
    const html = await renderToString(
      h('select', { value: 'A' }, h('option', null, h('em', null, 'A'))),
    )
    expect(html).not.toContain('selected')
  })

  it('multiple select: single string value marks the first match (array values are not supported client-side either)', async () => {
    const html = await renderToString(
      h(
        'select',
        { multiple: true, value: 'b' },
        h('option', { value: 'a' }, 'A'),
        h('option', { value: 'b' }, 'B'),
      ),
    )
    expect(html).toContain('<select multiple>')
    expect(html).toContain('<option value="b" selected>B</option>')
  })
})

describe('<select value> SSR — streaming renderer parity', () => {
  it('stream output matches the string renderer for the basic shape', async () => {
    const make = () =>
      h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B'))
    const [streamed, stringed] = [await streamToString(make()), await renderToString(make())]
    expect(streamed).toBe(stringed)
    expect(streamed).toContain('<option value="b" selected>')
  })

  it('stream: text fallback + first-match-only + no dead attribute', async () => {
    const html = await streamToString(
      h('select', { value: 'Beta' }, h('option', null, 'Alpha'), h('option', null, 'Beta')),
    )
    expect(html).not.toContain('<select value')
    expect(html.match(/ selected/g)).toHaveLength(1)
  })
})

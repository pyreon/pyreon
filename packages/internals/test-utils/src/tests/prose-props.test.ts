/**
 * The prose-props gate's pure halves.
 *
 * The gate asserts the one checkable thing about hand-written semantics: every
 * prop name the prose mentions must exist on the real type. It cannot check
 * that the prose is RIGHT about what a prop does — that is causal knowledge
 * nothing derives from source — but it closes the decay mode a rename causes,
 * where documentation stays specific and becomes wrong.
 *
 * End-to-end it is bisect-verified: renaming `contentDirection` in Element's
 * types makes it exit 1 naming that prop; restored, 12 names check clean.
 */
import { describe, expect, it } from 'vitest'
import { declaredProps, parseMarkers } from '../../../../../scripts/check-prose-props'

describe('parseMarkers', () => {
  it('reads a marker and splits its prop list', () => {
    const markers = parseMarkers('x.md', '<!-- @props @acme/ui Element: gap, block, alignX -->')
    expect(markers).toHaveLength(1)
    expect(markers[0]!.component).toBe('@acme/ui Element')
    expect(markers[0]!.props).toEqual(['gap', 'block', 'alignX'])
  })

  it('records the LINE, so a failure points at the prose to fix', () => {
    const text = ['# Title', '', 'prose', '<!-- @props A B: gap -->'].join('\n')
    expect(parseMarkers('x.md', text)[0]!.line).toBe(4)
  })

  it('strips backticks — authors write prop names the way they read', () => {
    const markers = parseMarkers('x.md', '<!-- @props A B: `gap`, `block` -->')
    expect(markers[0]!.props).toEqual(['gap', 'block'])
  })

  it('ignores prose with no markers — unmarked text is not checked', () => {
    // The opt-in contract. The Element prose backticks prop names, VALUES and
    // CSS terms alike; guessing between them would false-positive constantly,
    // and a gate that cries wolf gets suppressed.
    const text = 'Use `contentDirection` with `inline` and justify-content.'
    expect(parseMarkers('x.md', text)).toEqual([])
  })

  it('finds several markers in one file', () => {
    const text = ['<!-- @props A B: gap -->', 'prose', '<!-- @props C D: block -->'].join('\n')
    expect(parseMarkers('x.md', text).map((m) => m.component)).toEqual(['A B', 'C D'])
  })
})

describe('declaredProps', () => {
  it('collects property names from an interface body', () => {
    const src = ['export interface Props {', '  gap: number', '  block?: boolean', '}'].join('\n')
    expect([...declaredProps(src)].sort()).toEqual(['block', 'gap'])
  })

  it('ignores top-level declarations — only indented members are props', () => {
    const src = ['type Direction = string', 'export interface P {', '  direction: Direction', '}'].join(
      '\n',
    )
    const names = declaredProps(src)
    expect(names.has('direction')).toBe(true)
    expect(names.has('Direction')).toBe(false)
  })

  it('over-collecting is safe — the gate only asserts presence', () => {
    // Members of every interface in the file land in one set. That cannot cause
    // a false FAILURE (the gate checks a prose name IS present), only a missed
    // catch, which is the right direction for this trade.
    const src = ['interface A {', '  one: string', '}', 'interface B {', '  two: string', '}'].join(
      '\n',
    )
    expect([...declaredProps(src)].sort()).toEqual(['one', 'two'])
  })
})

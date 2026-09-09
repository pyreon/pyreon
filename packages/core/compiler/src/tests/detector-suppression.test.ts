// Inline suppression for the detectors.
//
// A pattern matcher without a type checker has findings that are correct code
// it cannot tell apart. `@pyreon/router`'s `RouterView` is the standing one: it
// ends on `child as unknown as VNodeChild`, and `child` there is
// `VNodeChild | null` — a union no `h()` overload accepts in rest position, so
// removing the cast is a TS2769. A comment beside it had said exactly that
// since the detector shipped, and the finding was reported on every run.
//
// Without an escape hatch the only two options are a permanent false positive
// or changing correct code to quiet a tool.

import { describe, expect, it } from 'vitest'
import { detectPyreonPatterns } from '../pyreon-intercept'
import { detectReactPatterns } from '../react-intercept'
import { filterSuppressed } from '../detector-suppression'

const CAST = `import { h } from '@pyreon/core'
export function View(props: { child: unknown }) {
  return h('div', {}, props.child as unknown as VNodeChild)
}
`
const codes = (src: string): string[] => detectPyreonPatterns(src).map((d) => d.code)

describe('detector inline suppression', () => {
  it('fires without a comment — the control that keeps the rest honest', () => {
    expect(codes(CAST)).toContain('as-unknown-as-vnodechild')
  })

  it('a bare `pyreon-lint-ignore` silences everything on the next line', () => {
    const src = CAST.replace('  return h(', '  // pyreon-lint-ignore\n  return h(')
    expect(codes(src)).not.toContain('as-unknown-as-vnodechild')
  })

  it('accepts the bare code AND the id the doctor prints', () => {
    for (const id of ['as-unknown-as-vnodechild', 'pyreon-patterns/as-unknown-as-vnodechild']) {
      const src = CAST.replace('  return h(', `  // pyreon-lint-ignore ${id}\n  return h(`)
      expect(codes(src), id).not.toContain('as-unknown-as-vnodechild')
    }
  })

  it('the disable-next-line alias works, as it does for the lint rules', () => {
    const src = CAST.replace('  return h(', '  // pyreon-lint-disable-next-line as-unknown-as-vnodechild\n  return h(')
    expect(codes(src)).not.toContain('as-unknown-as-vnodechild')
  })

  // The half that stops this becoming a way to mute findings by accident.
  it('a DIFFERENT code does not silence it, and neither does a typo', () => {
    for (const comment of [
      '// pyreon-lint-ignore for-missing-by',
      '// pyreon-lint-ignored',
      '// pyreon-lint-ignore as-unknown-as-vnodechild extra',
      '// not a suppression at all',
    ]) {
      const src = CAST.replace('  return h(', `  ${comment}\n  return h(`)
      expect(codes(src), comment).toContain('as-unknown-as-vnodechild')
    }
  })

  it('only the line ABOVE counts — a comment two lines up does not reach', () => {
    const src = CAST.replace('  return h(', '  // pyreon-lint-ignore as-unknown-as-vnodechild\n  const x = 1\n  return h(')
    expect(codes(src)).toContain('as-unknown-as-vnodechild')
  })

  it('the react detectors take the same comment, under their own prefix', () => {
    const react = `import { useState } from 'react'
export function C() {
  const [n, setN] = useState(0)
  return n
}
`
    const before = detectReactPatterns(react)
    expect(before.length).toBeGreaterThan(0)
    const line = before[0]!.line
    const lines = react.split('\n')
    lines.splice(line - 1, 0, `// pyreon-lint-ignore react-patterns/${before[0]!.code}`)
    const after = detectReactPatterns(lines.join('\n'))
    expect(after.map((d) => d.code)).not.toContain(before[0]!.code)
  })

  it('a source with no suppression comment is handed back untouched', () => {
    const diags = [{ code: 'x', line: 2 }]
    expect(filterSuppressed(diags, 'a\nb\n', 'pyreon-patterns')).toEqual(diags)
  })
})

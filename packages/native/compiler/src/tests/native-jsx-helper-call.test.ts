// A JSX-returning helper CALLED as a function — `{row("a")}`.
//
// The web supports this shape (the JS compiler's `jsxFnVars`/`isJsxHelperCall`
// recognise it). PMTC did not, and failed DIFFERENTLY per target with zero
// warnings:
//
//   Swift  `Text(verbatim: "\(row("a"))")` — a VIEW interpolated into a
//          STRING. It COMPILES and renders the value's debug description.
//   Kotlin `Text(text = "${row("a")}")` against a `fun row()` the component
//          emit gave no parameters — a hard build failure.
//
// One source, two different wrong answers. The first fix NAMED the shape on
// both targets and stopped interpolating a View into a string. The arrow
// helper with annotated parameters now LOWERS (a `@ViewBuilder func` /
// `@Composable fun` called in view position — render-slots.ts), so it is no
// longer a warning; the shapes that are really COMPONENTS (a top-level
// `function` declaration, a PascalCase arrow taking a props object) still
// cannot be called as functions and are still named.
//
// Bisect-load-bearing: revert the `jsxHelperCallName` guard in either emitter
// and the still-warned Swift specs fail with `Text(verbatim: "\(row("a"))")`
// present and `warnings` empty.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const app = (decl: string, child: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
${decl}
export function App() { return (<Stack>{${child}}</Stack>) }`

/** The arrow spellings — a view function, which now lowers. */
const LOWERED: readonly (readonly [string, string, string])[] = [
  ['file-scope arrow, lowercase', `const row = (x: string) => <Text>{x}</Text>`, `row("a")`],
  ['file-scope arrow, zero-arg', `const row = () => <Text>hi</Text>`, `row()`],
]

/** The spellings that are components, which have no function-call form. */
const SHAPES: readonly (readonly [string, string, string])[] = [
  ['function declaration', `function row(x: string) { return <Text>{x}</Text> }`, `row("a")`],
  [
    'PascalCase called as a function',
    `const Row = (p: { x: string }) => <Text>{p.x}</Text>`,
    `Row({ x: "a" })`,
  ],
]

describe('a JSX-returning ARROW helper called as a function renders in view position', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    for (const [name, decl, child] of LOWERED) {
      it(`${target}: ${name} — a view call, never interpolated`, () => {
        const out = transform(app(decl, child), { target })
        expect(out.warnings, name).toEqual([])
        // In view position, at the VStack / Column child indent — never inside a string.
        const indent = target === 'swift' ? '      ' : '    '
        expect(out.code, name).toContain(`\n${indent}${child}\n`)
        expect(out.code, name).toContain(target === 'swift' ? '@ViewBuilder private func row(' : '@Composable\nprivate fun row(')
      })
    }
  }
})

describe('a JSX-returning helper called as a function', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    for (const [name, decl, child] of SHAPES) {
      it(`${target}: ${name} — named, never interpolated`, () => {
        const out = transform(app(decl, child), { target })
        expect(out.warnings.join('\n'), name).toContain(
          'calls a JSX-returning helper as a FUNCTION',
        )
        // the remedy, not just the diagnosis
        expect(out.warnings.join('\n'), name).toContain('<')
        const bare = child.split('(')[0]!
        if (target === 'swift') {
          expect(out.code, name).not.toContain(`Text(verbatim: "\\(${bare}(`)
          expect(out.code, name).toContain('EmptyView()')
        } else {
          expect(out.code, name).not.toContain(`Text(text = "\${${bare}(`)
        }
      })
    }
  }

  // The CONTROL: the element form is the remedy the warning recommends, and
  // it must stay silent and correct.
  const CONTROL = `import { Stack, Text } from '@pyreon/primitives'
function Row(props: { x: string }) { return <Text>{props.x}</Text> }
export function App() { return (<Stack><Row x="a" /></Stack>) }`

  it('the ELEMENT form is unaffected on both targets', () => {
    const sw = transform(CONTROL, { target: 'swift' })
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('Row(x: "a")')
    const kt = transform(CONTROL, { target: 'kotlin' })
    expect(kt.warnings).toEqual([])
    expect(kt.code).toContain('Row(x = "a")')
  })

  // The SAME shape reaches `<Text>{row("a")}</Text>` through a different
  // emitter function. Covering only the container-child seam would have left
  // the identical View-into-a-string interpolation one call over.
  it('the <Text> child seam is covered too', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(
        `import { Stack, Text } from '@pyreon/primitives'
const row = (x: string) => <Text>{x}</Text>
export function App() { return (<Stack><Text>{row("a")}</Text></Stack>) }`,
        { target },
      )
      expect(out.warnings.join('\n'), target).toContain(
        'calls a JSX-returning helper as a FUNCTION',
      )
      expect(out.code, target).not.toContain('row("a")')
    }
  })

  // A call to a NON-JSX helper in child position must NOT be claimed — that
  // is an ordinary value child and still stringifies.
  it('a plain value helper call still renders as text', () => {
    const out = transform(app(`function label(x: string): string { return x }`, `label("a")`), {
      target: 'swift',
    })
    expect(out.warnings.filter((w) => w.includes('JSX-returning helper'))).toEqual([])
    expect(out.code).toContain('Text(verbatim: "\\(label("a"))")')
  })
})

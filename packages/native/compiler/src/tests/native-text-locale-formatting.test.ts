// `Text(verbatim:)` — the locale-formatting bug a REAL app surfaced.
//
// THE BUG. A Swift string literal containing interpolation resolves to
// SwiftUI's `Text(_ key: LocalizedStringKey)` overload, and
// `LocalizedStringKey`'s interpolation FORMATS its arguments through the
// current locale. So the emit
//
//     Text("\(balance)")        // balance == 2700
//
// renders **"2 700"** (or "2,700", per region) instead of "2700" — the iOS
// build silently disagrees with the web and Android targets compiled from the
// SAME source, and the output changes with the device's region.
//
// WHY EVERY DEMO APP MISSED IT. Grouping separators only appear at four
// figures. The counter renders "Count: 0", todomvc renders small counts,
// router-demo renders paths. The bug was invisible until an app displayed a
// number >= 1000 — found on a Simulator by the finance ledger's 2700 balance
// (`examples/native-finance` + its device gate). A demo app could not have
// surfaced this; that is the argument for a real-app gate.
//
// THE FIX. Emit `Text(verbatim: "…")` whenever the content interpolates.
// `verbatim:` takes a plain `String` and performs no localization or
// formatting, which is the correct semantic for PMTC: the text comes from the
// app's own source, and localization goes through `PyreonI18n.t(...)`, whose
// result is an already-resolved String.
//
// A pure literal keeps the plain `Text("…")` form — it has no arguments to
// format, and staying on the LocalizedStringKey overload preserves
// .strings-table lookup for anyone who wants it.
//
// KOTLIN IS UNAFFECTED: Compose's `Text(text = "${x}")` takes an ordinary
// Kotlin String, which applies no locale formatting. Asserted below so the
// asymmetry stays deliberate.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' }).code
const kotlin = (src: string) => transform(src, { target: 'kotlin' }).code

const NUMERIC = `import { signal } from '@pyreon/reactivity'
export function Balance() {
  const total = signal<number>(2700)
  return <Text>{total()}</Text>
}`

const MIXED = `import { signal } from '@pyreon/reactivity'
export function Counter() {
  const count = signal<number>(0)
  return <Text>Count: {count()}</Text>
}`

const LITERAL = `export function Title() {
  return <Text>Ledger</Text>
}`

describe('Text locale formatting (Swift)', () => {
  it('an interpolating Text emits verbatim: — NOT the LocalizedStringKey overload', () => {
    // This is the whole fix: without `verbatim:`, 2700 renders as "2 700".
    expect(swift(NUMERIC)).toContain('Text(verbatim: "\\(total)")')
  })

  it('a MIXED literal+interpolation Text is verbatim too', () => {
    // "Count: \(count)" still selects the LocalizedStringKey overload — the
    // literal prefix does not make it safe.
    expect(swift(MIXED)).toContain('Text(verbatim: "Count: \\(count)")')
  })

  it('a PURE literal Text keeps the plain form (nothing to format)', () => {
    const out = swift(LITERAL)
    expect(out).toContain('Text("Ledger")')
    expect(out).not.toContain('Text(verbatim: "Ledger")')
  })

  it('a sole String(...) child passes through — no interpolation wrapper', () => {
    // Not cosmetic: wrapping an already-String expression in an interpolation
    // re-opens DefaultStringInterpolation's overload set around it, and on a
    // non-trivial expression swiftc gives up with "unable to type-check this
    // expression in reasonable time" (caught by the real-SwiftUI gate on the
    // sort/spread fixture's 4-term sum).
    const out = swift(`import { signal } from '@pyreon/reactivity'
export function C() {
  const a = signal<number[]>([1])
  const b = signal<number[]>([2])
  return <Text>{String(a().length + b().length)}</Text>
}`)
    expect(out).toContain('Text(verbatim: String(')
    expect(out).not.toContain('Text(verbatim: "\\(String(')
  })

  it('the router fallback views interpolate a path, so they are verbatim as well', () => {
    // Hand-written emits in the router lowering — same rule, easy to miss
    // because they are not built through the Text child path.
    const out = swift(`import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
export function App() {
  const router = createRouter({ routes: [] })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}`)
    if (out.includes('Pyreon Router: no route for')) {
      expect(out).toContain('Text(verbatim: "Pyreon Router: no route for')
    }
  })
})

describe('Text locale formatting (Kotlin — unaffected, asserted deliberately)', () => {
  it('Compose keeps a plain interpolated String (no locale formatting there)', () => {
    const out = kotlin(NUMERIC)
    expect(out).toContain('Text(text = "${total}")')
    expect(out).not.toContain('verbatim')
  })

  it('the mixed form is a plain Kotlin template too', () => {
    expect(kotlin(MIXED)).toContain('Text(text = "Count: ${count}")')
  })
})

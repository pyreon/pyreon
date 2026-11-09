/**
 * Compile-time type tests for element-specific attributes of the HTML
 * text-semantics and edit elements. `<time datetime>` used to fall through
 * to the bare `PyreonHTMLAttributes`, so writing the standard attribute was
 * a type error (found building the docs blog's post dates); `cite`,
 * `<del>`/`<ins>` and `<data value>` had the same gap.
 */
import { describe, expectTypeOf, it } from 'vitest'
import type {} from '../jsx-runtime'

type El = JSX.IntrinsicElements

describe('text-semantics element attributes', () => {
  it('<time> accepts datetime', () => {
    expectTypeOf<El['time']>().toHaveProperty('datetime')
  })

  it('<blockquote> and <q> accept cite', () => {
    expectTypeOf<El['blockquote']>().toHaveProperty('cite')
    expectTypeOf<El['q']>().toHaveProperty('cite')
  })

  it('<del> and <ins> accept cite and datetime', () => {
    expectTypeOf<El['del']>().toHaveProperty('datetime')
    expectTypeOf<El['ins']>().toHaveProperty('cite')
  })

  it('<data> accepts value', () => {
    expectTypeOf<El['data']>().toHaveProperty('value')
  })
})

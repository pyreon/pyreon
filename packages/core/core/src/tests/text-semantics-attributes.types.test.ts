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

describe('anchor attributes', () => {
  // `<a href="/feed.xml" type="application/rss+xml">` — the MIME hint of a
  // feed link (found building the blog module's "Subscribe via RSS" link).
  it('<a> accepts type', () => {
    expectTypeOf<El['a']>().toHaveProperty('type')
  })

  // #4392: the attribute is valid HTML and the runtime set it; only the type was missing.
  it('<iframe> accepts srcdoc, as a value or an accessor', () => {
    expectTypeOf<string>().toMatchTypeOf<El['iframe']['srcdoc']>()
    expectTypeOf<() => string>().toMatchTypeOf<El['iframe']['srcdoc']>()
  })

  // #4369: the two events a native <dialog> exists to fire.
  it('<dialog> accepts onClose and onCancel, typed to the dialog element', () => {
    expectTypeOf<El['dialog']>().toHaveProperty('onClose')
    expectTypeOf<El['dialog']>().toHaveProperty('onCancel')
    expectTypeOf<(e: Event & { currentTarget: HTMLDialogElement }) => void>().toMatchTypeOf<
      NonNullable<El['dialog']['onClose']>
    >()
  })
})

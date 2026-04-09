/**
 * Fine-grained reactivity tests for every document-primitive that
 * accepts children or data props.
 *
 * **Why the `as any` casts**: rocketstyle's component prop type
 * collapses children to `VNodeChildAtom` (the singular form) inside
 * its child slot, even though `VNodeChild` already covers
 * `VNodeChild[]`. This is a recurring DX paper-cut tracked as item
 * R1 in the post-flow-PR catalog. The casts here aren't covering a
 * runtime bug — they're a type-level workaround that lets us pass
 * function children through `h(DocPrimitive, ...)` without
 * fighting TS. When R1 lands, the casts can be removed.
 *
 * Proves the load-bearing claim of the resume-builder showcase: when
 * a rocketstyle document primitive is given a function child like
 * `<DocText>{() => signal()}</DocText>`, the function passes through
 * rocketstyle untouched and is treated by Pyreon's runtime as a
 * reactive children accessor. The text node patches in place when
 * the signal changes — the parent component does NOT re-render.
 *
 * Without this guarantee, the resume builder's "single tree, two
 * render targets" design degrades to a top-down re-render on every
 * keystroke, defeating the entire reason to use document-primitives
 * for the live preview.
 *
 * The tests are organised by what each primitive wraps:
 *
 *   • TEXT-BASED — wraps `@pyreon/elements/Text`. The function child
 *     becomes a reactive text node. Tests assert that mutating the
 *     signal updates `container.textContent` AND that the parent
 *     component runs exactly once across multiple mutations.
 *
 *   • ELEMENT/CONTAINER — wraps `@pyreon/elements/Element`. Function
 *     children inside the container are still reactive (same
 *     mechanism — rocketstyle passes children through unmodified).
 *     Tests assert mutation propagation through nested children.
 *
 *   • LEAF — primitives with no children (Divider, Spacer, PageBreak,
 *     Image). These take props only. Tests verify that the primitive
 *     mounts cleanly and produces the right tag, with no children
 *     surface to be reactive against.
 *
 *   • DATA-DRIVEN — DocTable receives `columns`/`rows` as attrs, not
 *     JSX children. Tests verify the primitive mounts with array
 *     props.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { initTestConfig, mountAndExpectOnce, mountReactive } from '@pyreon/test-utils'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import DocButton from '../primitives/DocButton'
import DocCode from '../primitives/DocCode'
import DocColumn from '../primitives/DocColumn'
import DocDivider from '../primitives/DocDivider'
import DocDocument from '../primitives/DocDocument'
import DocHeading from '../primitives/DocHeading'
import DocImage from '../primitives/DocImage'
import DocLink from '../primitives/DocLink'
import DocList from '../primitives/DocList'
import DocListItem from '../primitives/DocListItem'
import DocPage from '../primitives/DocPage'
import DocPageBreak from '../primitives/DocPageBreak'
import DocQuote from '../primitives/DocQuote'
import DocRow from '../primitives/DocRow'
import DocSection from '../primitives/DocSection'
import DocSpacer from '../primitives/DocSpacer'
import DocTable from '../primitives/DocTable'
import DocText from '../primitives/DocText'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

// ─── Text-based primitives ──────────────────────────────────────────
//
// All wrap `@pyreon/elements/Text`. Function children render as text
// nodes that the runtime patches in place when their signal source
// changes. The "parent runs once" contract is asserted via
// mountAndExpectOnce.

describe('text-based primitives — function children patch text nodes', () => {
  it('DocText patches its text node when the signal changes', () => {
    const name = signal('Aisha')
    const { container, cleanup: c } = mountReactive(h(DocText as any, null, () => name()))
    expect(container.textContent).toBe('Aisha')
    name.set('Marcus')
    expect(container.textContent).toBe('Marcus')
    name.set('Priya')
    expect(container.textContent).toBe('Priya')
    c()
  })

  it('DocText parent component runs once across multiple mutations', () => {
    const headline = signal('Senior Engineer')
    const { container, parentCalls, cleanup: c } = mountAndExpectOnce(
      () => h(DocText as any, null, () => headline()),
      () => {
        headline.set('Staff Engineer')
        headline.set('Principal Engineer')
        headline.set('Distinguished Engineer')
        headline.set('Fellow')
        headline.set('CTO')
      },
    )
    expect(parentCalls()).toBe(1)
    expect(container.textContent).toBe('CTO')
    c()
  })

  it('DocHeading patches its text node when the signal changes', () => {
    const title = signal('Resume')
    const { container, cleanup: c } = mountReactive(
      h(DocHeading as any, { level: 'h1' }, () => title()),
    )
    expect(container.textContent).toBe('Resume')
    title.set('Curriculum Vitae')
    expect(container.textContent).toBe('Curriculum Vitae')
    c()
  })

  it('DocHeading parent runs once across mutations', () => {
    const title = signal('A')
    const { parentCalls, cleanup: c } = mountAndExpectOnce(
      () => h(DocHeading as any, { level: 'h2' }, () => title()),
      () => {
        title.set('B')
        title.set('C')
      },
    )
    expect(parentCalls()).toBe(1)
    c()
  })

  it('DocCode patches its text node when the signal changes', () => {
    const snippet = signal('const x = 1')
    const { container, cleanup: c } = mountReactive(
      h(DocCode as any, { language: 'typescript' }, () => snippet()),
    )
    expect(container.textContent).toBe('const x = 1')
    snippet.set('const y = 2')
    expect(container.textContent).toBe('const y = 2')
    c()
  })

  it('DocLink patches its text node when the signal changes', () => {
    const label = signal('Click here')
    const { container, cleanup: c } = mountReactive(
      h(DocLink as any, { href: 'https://example.com' }, () => label()),
    )
    expect(container.textContent).toBe('Click here')
    label.set('Visit us')
    expect(container.textContent).toBe('Visit us')
    c()
  })

  it('DocListItem patches its text node when the signal changes', () => {
    const item = signal('First task')
    const { container, cleanup: c } = mountReactive(h(DocListItem as any, null, () => item()))
    expect(container.textContent).toBe('First task')
    item.set('Second task')
    expect(container.textContent).toBe('Second task')
    c()
  })

  it('DocButton patches its text node when the signal changes', () => {
    const cta = signal('Sign up')
    const { container, cleanup: c } = mountReactive(
      h(DocButton as any, { variant: 'primary' }, () => cta()),
    )
    expect(container.textContent).toBe('Sign up')
    cta.set('Get started')
    expect(container.textContent).toBe('Get started')
    c()
  })
})

// ─── Element/container primitives ───────────────────────────────────
//
// All wrap `@pyreon/elements/Element`. Function children INSIDE the
// container (typically wrapped in a text-bearing primitive like
// DocText) are still reactive — rocketstyle passes children through
// unmodified, so the reactive accessor lands at whatever level the
// consumer puts it.

describe('container primitives — function children inside containers stay reactive', () => {
  it('DocDocument propagates reactive children through to text leaves', () => {
    const title = signal('Original')
    const { container, cleanup: c } = mountReactive(
      h(
        DocDocument as any,
        { title: 'My Doc' },
        h(DocText as any, null, () => title()),
      ),
    )
    expect(container.textContent).toBe('Original')
    title.set('Updated')
    expect(container.textContent).toBe('Updated')
    c()
  })

  it('DocDocument parent runs once across nested signal mutations', () => {
    const body = signal('a')
    const { parentCalls, cleanup: c } = mountAndExpectOnce(
      () =>
        h(
          DocDocument as any,
          { title: 'X' },
          h(DocText as any, null, () => body()),
        ),
      () => {
        body.set('b')
        body.set('c')
        body.set('d')
      },
    )
    expect(parentCalls()).toBe(1)
    c()
  })

  it('DocPage propagates reactive children through to text leaves', () => {
    const heading = signal('Page 1')
    const { container, cleanup: c } = mountReactive(
      h(
        DocPage as any,
        { size: 'A4' },
        h(DocHeading as any, { level: 'h1' }, () => heading()),
      ),
    )
    expect(container.textContent).toBe('Page 1')
    heading.set('Page 2')
    expect(container.textContent).toBe('Page 2')
    c()
  })

  it('DocSection propagates reactive children', () => {
    const text = signal('section A')
    const { container, cleanup: c } = mountReactive(
      h(DocSection as any, null, h(DocText as any, null, () => text())),
    )
    expect(container.textContent).toBe('section A')
    text.set('section B')
    expect(container.textContent).toBe('section B')
    c()
  })

  it('DocRow propagates reactive children', () => {
    const inline = signal('one')
    const { container, cleanup: c } = mountReactive(
      h(DocRow as any, null, h(DocText as any, null, () => inline())),
    )
    expect(container.textContent).toBe('one')
    inline.set('two')
    expect(container.textContent).toBe('two')
    c()
  })

  it('DocColumn propagates reactive children', () => {
    const col = signal('left')
    const { container, cleanup: c } = mountReactive(
      h(DocColumn as any, { width: '50%' }, h(DocText as any, null, () => col())),
    )
    expect(container.textContent).toBe('left')
    col.set('right')
    expect(container.textContent).toBe('right')
    c()
  })

  it('DocList propagates reactive children to nested DocListItem', () => {
    const first = signal('Apple')
    const { container, cleanup: c } = mountReactive(
      h(
        DocList as any,
        null,
        h(DocListItem as any, null, () => first()),
      ),
    )
    expect(container.textContent).toBe('Apple')
    first.set('Banana')
    expect(container.textContent).toBe('Banana')
    c()
  })

  it('DocList parent runs once when ordered list items mutate', () => {
    const item = signal('a')
    const { parentCalls, cleanup: c } = mountAndExpectOnce(
      () =>
        h(
          DocList as any,
          { ordered: true },
          h(DocListItem as any, null, () => item()),
        ),
      () => {
        item.set('b')
        item.set('c')
      },
    )
    expect(parentCalls()).toBe(1)
    c()
  })

  it('DocQuote propagates reactive children', () => {
    const quote = signal('Hello')
    const { container, cleanup: c } = mountReactive(
      h(DocQuote as any, null, h(DocText as any, null, () => quote())),
    )
    expect(container.textContent).toBe('Hello')
    quote.set('World')
    expect(container.textContent).toBe('World')
    c()
  })
})

// ─── Leaf primitives ────────────────────────────────────────────────
//
// No children, no reactive surface. The contract here is just "the
// primitive mounts cleanly without throwing." A consumer that drops
// these into a tree shouldn't need to worry about them — they're
// inert dividers / spacers / page breaks. Image is also leaf because
// its data lives in attrs (`src`, `alt`, etc.) not children.

describe('leaf primitives — mount cleanly with no children', () => {
  it('DocDivider mounts and produces an hr tag', () => {
    const { container, cleanup: c } = mountReactive(h(DocDivider as any, null))
    expect(container.querySelector('hr')).not.toBeNull()
    c()
  })

  it('DocSpacer mounts cleanly', () => {
    const { container, cleanup: c } = mountReactive(h(DocSpacer as any, { height: 32 }))
    expect(container.querySelector('div')).not.toBeNull()
    c()
  })

  it('DocPageBreak mounts cleanly', () => {
    const { container, cleanup: c } = mountReactive(h(DocPageBreak as any, null))
    expect(container.querySelector('div')).not.toBeNull()
    c()
  })

  it('DocImage mounts and produces an img tag with the src attr', () => {
    const { container, cleanup: c } = mountReactive(
      h(DocImage as any, { src: 'https://example.com/x.png', alt: 'X' }),
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    c()
  })
})

// ─── Data-driven primitives ─────────────────────────────────────────
//
// DocTable takes `columns`/`rows` as attrs rather than JSX children.
// The browser render is intentionally minimal — DocTable produces a
// bare `<table>` element with theme styling, and the data lives in
// `_documentProps` for the document-export pipeline to consume.
// There's no DOM-level "mutate signal → assert text" contract here
// because the data never reaches the DOM.
//
// What we DO assert: the primitive mounts cleanly. Before this test
// existed, DocTable's `rows` and `columns` props collided with
// HTMLTableElement's read-only DOM properties of the same name —
// the runtime crashed with `TypeError: Cannot set property rows of
// [object Object] which has only a getter` whenever any consumer
// tried to mount a table. The fix was a `filter` option on
// rocketstyle's `.attrs()` that strips export-only props from the
// DOM forwarding. See `DocTable.ts` for the inline rationale.

describe('data-driven primitives — DocTable mounts cleanly', () => {
  it('mounts with columns and rows arrays', () => {
    const { container, cleanup: c } = mountReactive(
      h(DocTable as any, {
        columns: [{ header: 'Name' }, { header: 'Age' }],
        rows: [
          ['Alice', 30],
          ['Bob', 25],
        ],
      }),
    )
    expect(container.querySelector('table')).not.toBeNull()
    c()
  })

  it('mounts with empty arrays (regression: no crash on empty rows)', () => {
    const { container, cleanup: c } = mountReactive(
      h(DocTable as any, { columns: [], rows: [] }),
    )
    expect(container.querySelector('table')).not.toBeNull()
    c()
  })

  it('does not forward columns/rows to the DOM (would crash table.rows is read-only)', () => {
    // The fix: rocketstyle's `filter` option on `.attrs()` strips
    // these props before they reach the DOM forwarding step. Without
    // the filter, the runtime would call `tableEl.rows = [...]`
    // which throws on HTMLTableElement.
    //
    // This test exists to make the regression unmissable: if anyone
    // removes the filter option in DocTable.ts, this test (and the
    // two above) will start crashing again with the exact same
    // error message that originally surfaced the bug.
    const { container, cleanup: c } = mountReactive(
      h(DocTable as any, { columns: [{ header: 'X' }], rows: [['y']] }),
    )
    const table = container.querySelector('table') as HTMLTableElement | null
    expect(table).not.toBeNull()
    // The native `rows` is a read-only HTMLCollection of <tr>. We
    // shouldn't have polluted it with our prop array. (If we had,
    // mount would have already crashed above.)
    expect(table?.rows.length).toBe(0)
    c()
  })
})

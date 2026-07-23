// @pyreon/native alias-import guard — the Element / PyreonUI / Container / Row /
// Col hooks intercept a tag ONLY when it is imported from its EXPECTED @pyreon
// package. So a user component that happens to share one of those names (e.g.
// `import { Row } from './my-components'`) is NOT mis-lowered as a coolgrid Row
// — it stays a plain component call. An untracked name keeps prior behaviour,
// so the guard only SUPPRESSES a name imported from another package (purely
// additive precision).
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' }).code
const kotlin = (src: string) => transform(src, { target: 'kotlin' }).code

describe('alias-import guard — @pyreon/elements Element', () => {
  it('Element from @pyreon/elements lowers to a native Stack', () => {
    const src = `import { Element } from '@pyreon/elements'
export function App() { return (<Element>Hi</Element>) }`
    expect(swift(src)).toContain('VStack')
    expect(kotlin(src)).toContain('Column')
  })

  it('Element from a USER module is NOT intercepted (stays a component call)', () => {
    const src = `import { Element } from './my-components'
export function App() { return (<Element>Hi</Element>) }`
    // No Stack lowering — the tag renders as the user's own Element view.
    expect(swift(src)).not.toContain('VStack')
    expect(swift(src)).toContain('Element {')
    expect(kotlin(src)).not.toContain('Column')
    expect(kotlin(src)).toContain('Element {')
  })
})

describe('alias-import guard — @pyreon/coolgrid Row', () => {
  it('Row from @pyreon/coolgrid lowers to a horizontal Stack (HStack)', () => {
    const src = `import { Row } from '@pyreon/coolgrid'
export function App() { return (<Row>Hi</Row>) }`
    expect(swift(src)).toContain('HStack')
  })

  it('Row from a USER module is NOT mis-lowered as a coolgrid Row', () => {
    const src = `import { Row } from './my-components'
export function App() { return (<Row>Hi</Row>) }`
    expect(swift(src)).not.toContain('HStack')
    expect(swift(src)).toContain('Row {')
  })
})

describe('alias-import guard — @pyreon/ui-core PyreonUI', () => {
  it('PyreonUI from @pyreon/ui-core is a transparent wrapper (Group)', () => {
    const src = `import { PyreonUI } from '@pyreon/ui-core'
export function App() { return (<PyreonUI>Hi</PyreonUI>) }`
    expect(swift(src)).toContain('Group {')
  })

  it('PyreonUI from a USER module is NOT intercepted (kept as a component)', () => {
    const src = `import { PyreonUI } from './providers'
export function App() { return (<PyreonUI>Hi</PyreonUI>) }`
    expect(swift(src)).not.toContain('Group {')
    expect(swift(src)).toContain('PyreonUI {')
  })
})

describe('alias-import guard — untracked name keeps prior behaviour', () => {
  it('an un-imported Element tag still lowers (back-compat: undefined source → intercept)', () => {
    // No import for Element at all → _aliasImports has no entry → the guard
    // falls back to prior behaviour and intercepts (an unusual shape, but the
    // fix must never REGRESS a name that was previously lowered).
    const src = `export function App() { return (<Element>Hi</Element>) }`
    expect(swift(src)).toContain('VStack')
  })
})

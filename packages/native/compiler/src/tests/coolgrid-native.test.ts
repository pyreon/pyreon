// `@pyreon/coolgrid` native frontend — Container / Row / Col → native layout.
//
// Container (column) → VStack/Column; Row (row) → HStack/Row; Col → a FRACTIONAL
// span for a literal size (SwiftUI containerRelativeFrame span/12, Compose
// RowScope Modifier.weight(size)), or an EQUAL-fill child with no size (SwiftUI
// .frame(maxWidth:.infinity), Compose Box(Modifier.weight(1f))). coolgrid's
// raw-px gap is converted to the Stack scale index. A responsive/non-literal
// size warns + falls back to an equal column.
//
// Compose used to lower a span to `fillMaxWidth(size/12f)`, which this file
// asserted. DEVICE-FOUND (router-demo /styles, real emulator geometry): a Row
// measures each child against the REMAINING width, so fractional fills
// COMPOUND — 3/12 then 9/12 lays out as 25% + 56% and the row never adds up.
// `weight(3f)` + `weight(9f)` divides the row exactly, which is what a grid
// means and what the Swift twin's containerRelativeFrame(count:span:) always
// did. The assertions below are the corrected truth; the old ones encoded the
// bug (they matched the emitted string perfectly while the layout was wrong —
// a compile-level assertion can only ever confirm the code agrees with itself).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { coolgridToStack, isCoolgridTag } from '../coolgrid-native'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

const GRID = `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/elements'
export function App() {
  return (
    <Container gap={16}>
      <Row gap={8}>
        <Col><Text>A</Text></Col>
        <Col><Text>B</Text></Col>
      </Row>
    </Container>
  )
}`

const GRID_FRACTIONAL = `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/elements'
export function App() {
  return (
    <Container>
      <Row gap={8}>
        <Col size={8}><Text>Main</Text></Col>
        <Col size={4}><Text>Side</Text></Col>
      </Row>
    </Container>
  )
}`

describe('coolgrid-native — Container / Row / Col', () => {
  it('Container → vertical Stack, Row → horizontal Stack, gap in raw px (Swift)', () => {
    const { code } = swift(GRID)
    expect(code).toContain('VStack(spacing: 16)') // Container gap 16px
    expect(code).toContain('HStack(spacing: 8)') // Row gap 8px
  })

  it('Container → Column, Row → Row, gap in raw px (Kotlin)', () => {
    const { code } = kotlin(GRID)
    expect(code).toContain('Column(verticalArrangement = Arrangement.spacedBy(16.dp))')
    expect(code).toContain('Row(horizontalArrangement = Arrangement.spacedBy(8.dp))')
  })

  it('Col → an EQUAL-fill child on both targets', () => {
    expect(swift(GRID).code).toContain('.frame(maxWidth: .infinity)')
    expect(kotlin(GRID).code).toContain('Box(modifier = Modifier.weight(1f)) {')
  })

  it('a literal `size` span lowers to a FRACTIONAL width (no warn) on both targets', () => {
    const src = `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/elements'
export function App() { return (<Container><Row><Col size={8}><Text>Main</Text></Col><Col size={4}><Text>Side</Text></Col></Row></Container>) }`
    // Swift: iOS 17 grid-column primitive, span/12 of the container.
    expect(swift(src).code).toContain('.containerRelativeFrame(.horizontal, count: 12, span: 8, spacing: 0)')
    expect(swift(src).code).toContain('.containerRelativeFrame(.horizontal, count: 12, span: 4, spacing: 0)')
    // Compose: RowScope weight — an exact 8:4 division of the row.
    expect(kotlin(src).code).toContain('Modifier.weight(8f)')
    expect(kotlin(src).code).toContain('Modifier.weight(4f)')
    expect(kotlin(src).code).not.toContain('fillMaxWidth')
    // A literal span is fully supported → no fallback warning.
    expect(swift(src).warnings.join('\n')).not.toMatch(/EQUAL column/)
    expect(kotlin(src).warnings.join('\n')).not.toMatch(/EQUAL column/)
  })

  it('size > columns clamps to a full-width (12/12) span', () => {
    const src = `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/elements'
export function App() { return (<Container><Row><Col size={16}><Text>Wide</Text></Col></Row></Container>) }`
    expect(swift(src).code).toContain('span: 12')
    expect(kotlin(src).code).toContain('Modifier.weight(12f)')
  })

  it('a responsive / non-literal `size` warns + falls back to an equal column', () => {
    const src = `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/elements'
export function App() { return (<Container><Row><Col size={{ xs: 12, md: 6 }}><Text>Resp</Text></Col></Row></Container>) }`
    expect(swift(src).warnings.join('\n')).toMatch(/only a LITERAL integer span/)
    expect(swift(src).code).toContain('.frame(maxWidth: .infinity)')
    expect(kotlin(src).code).toContain('Modifier.weight(1f)')
    expect(swift(src).code).not.toContain('containerRelativeFrame')
  })

  it('isCoolgridTag + coolgridToStack retag Container/Row to Stack', () => {
    expect(isCoolgridTag('Container')).toBe(true)
    expect(isCoolgridTag('Row')).toBe(true)
    expect(isCoolgridTag('Col')).toBe(true)
    expect(isCoolgridTag('Element')).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = coolgridToStack({ kind: 'jsx-element', tag: 'Row', attrs: [], children: [] } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((row as any).tag).toBe('Stack')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((row as any).attrs.some((a: any) => a.name === 'direction' && a.value.value === 'row')).toBe(true)
  })
})

describe('coolgrid-native — toolchain gates (real SDKs)', () => {
  it.skipIf(!isSwiftUIAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the grid typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(swift(GRID).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the grid compiles (real kotlinc)', () => {
    const res = validateKotlin(kotlin(GRID).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the FRACTIONAL grid typechecks — containerRelativeFrame resolves (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(swift(GRID_FRACTIONAL).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the FRACTIONAL grid compiles — RowScope weight resolves (real kotlinc)', () => {
    const res = validateKotlin(kotlin(GRID_FRACTIONAL).code)
    expect(res.ok, res.error).toBe(true)
  })
})

describe('Col test identifiers ride the SIZED node', () => {
  // Device-found alongside the weight() fix: the `data-testid` on a <Col> was
  // landing on the INNER stack while the width lived on the wrapper Box, so
  // the tagged node hugged its glyph — a 3/12 column measured 7.2dp of a 308dp
  // row (2.3%, not 25%) and the column's real geometry was unaddressable.
  // Same class as the <Link> identifier drop: an element you cannot select is
  // an element nobody can prove works. Swift never had the split.
  const SRC = `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/elements'
export function App() {
  return (<Container><Row><Col size={3} data-testid="c3"><Text>L</Text></Col></Row></Container>)
}`

  it('Kotlin: the tag is on the weighted Box, and appears exactly once', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('Modifier.weight(3f).testTag("c3")')
    // Exactly one node may carry it — two would make onNodeWithTag ambiguous.
    expect(out.match(/testTag\("c3"\)/g)).toHaveLength(1)
  })

  it('Swift: identifier and span already share one node', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('.accessibilityIdentifier("c3").containerRelativeFrame(.horizontal, count: 12, span: 3, spacing: 0)')
  })
})

// `@pyreon/coolgrid` native frontend — Container / Row / Col → native layout.
//
// Container (column) → VStack/Column; Row (row) → HStack/Row; Col → a FRACTIONAL
// span for a literal size (SwiftUI containerRelativeFrame span/12, Compose
// fillMaxWidth(size/12f)), or an EQUAL-fill child with no size (SwiftUI
// .frame(maxWidth:.infinity), Compose Box(Modifier.weight(1f))). coolgrid's
// raw-px gap is converted to the Stack scale index. A responsive/non-literal
// size warns + falls back to an equal column.

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
    // Compose: absolute size/12 fraction of the Row width.
    expect(kotlin(src).code).toContain('Modifier.fillMaxWidth(8f / 12f)')
    expect(kotlin(src).code).toContain('Modifier.fillMaxWidth(4f / 12f)')
    // A literal span is fully supported → no fallback warning.
    expect(swift(src).warnings.join('\n')).not.toMatch(/EQUAL column/)
    expect(kotlin(src).warnings.join('\n')).not.toMatch(/EQUAL column/)
  })

  it('size > columns clamps to a full-width (12/12) span', () => {
    const src = `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/elements'
export function App() { return (<Container><Row><Col size={16}><Text>Wide</Text></Col></Row></Container>) }`
    expect(swift(src).code).toContain('span: 12')
    expect(kotlin(src).code).toContain('Modifier.fillMaxWidth(12f / 12f)')
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
  it.skipIf(!isKotlincAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the FRACTIONAL grid compiles — fillMaxWidth resolves (real kotlinc)', () => {
    const res = validateKotlin(kotlin(GRID_FRACTIONAL).code)
    expect(res.ok, res.error).toBe(true)
  })
})

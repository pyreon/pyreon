// `@pyreon/coolgrid` native frontend — Container / Row / Col → native layout.
//
// Container (column) → VStack/Column; Row (row) → HStack/Row; Col → an EQUAL-fill
// child (SwiftUI .frame(maxWidth:.infinity), Compose Box(Modifier.weight(1f))).
// coolgrid's raw-px gap is converted to the Stack scale index. Fractional `size`
// spans warn + lower as equal columns (true fractional = a GeometryReader follow-up).

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

  it('a fractional `size` span warns (lowers as an equal column)', () => {
    const src = `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/elements'
export function App() { return (<Container><Row><Col size={8}><Text>Main</Text></Col><Col size={4}><Text>Side</Text></Col></Row></Container>) }`
    expect(swift(src).warnings.join('\n')).toMatch(/fractional column span lowers as an EQUAL column/)
    // still lowers (equal columns) — no drop
    expect(swift(src).code).toContain('.frame(maxWidth: .infinity)')
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
  it.skipIf(!isSwiftUIAvailable())('the grid typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(swift(GRID).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('the grid compiles (real kotlinc)', () => {
    const res = validateKotlin(kotlin(GRID).code)
    expect(res.ok, res.error).toBe(true)
  })
})

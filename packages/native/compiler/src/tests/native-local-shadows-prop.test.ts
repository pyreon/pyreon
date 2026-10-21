// A component-level helper / state / computed that shares a name with a PROP is legal JavaScript (`props.edge` vs
// `edge`) and was silently wrong natively: props and locals share one namespace in the emitted struct / function.
//
// Found by compiling every manifest `api[].example` through the real compiler: the documented `BaseEdge` custom-edge
// example (`const edge = () => getBezierPath(…)` inside a component whose `EdgeComponentProps` has an `edge` field)
// emitted Swift that failed with "invalid redeclaration of 'edge()'" and ZERO warnings.
import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { FIRST_PARTY_VALIDATE_OPTIONS } from '../../../../../scripts/native-first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const edgeSource = (helper: string) => `import { BaseEdge, getBezierPath } from '@pyreon/flow'
import type { EdgeComponentProps } from '@pyreon/flow'
export function Wire(props: EdgeComponentProps) {
  const ${helper} = () => getBezierPath({ sourceX: props.sourceX(), sourceY: props.sourceY(), targetX: props.targetX(), targetY: props.targetY() })
  return <BaseEdge path={${helper}().path} label="wire" labelX={${helper}().labelX} labelY={${helper}().labelY} />
}`

describe('a local that shares a name with a prop', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: warns, naming the local, the prop and the fix`, () => {
      const w = transform(edgeSource('edge'), { target }).warnings.join('\n')
      expect(w).toMatch(/Component `Wire`: the local `edge` has the same name as the prop `edge`/)
      expect(w).toMatch(/Rename the local/)
    })
  }
  it('the renamed helper is silent', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(edgeSource('curve'), { target }).warnings).toEqual([])
    }
  })
  it.skipIf(!isSwiftcAvailable())('the renamed helper type-checks (the advice is sound)', () => {
    const r = transform(edgeSource('curve'), { target: 'swift' })
    const v = validateSwiftWithStubs(r.code, FIRST_PARTY_VALIDATE_OPTIONS)
    expect(v.ok, v.ok ? '' : String((v as { error?: string }).error)).toBe(true)
  })
  // The SECOND defect behind the same documented example: a helper wrapping a plugin function had no return type,
  // so on Swift it was a Void function and `curve().path` failed to compile — whatever the helper was called.
  it('a helper wrapping a flow path builder is typed (not a Void function)', () => {
    const swift = transform(edgeSource('curve'), { target: 'swift' }).code
    expect(swift).toMatch(/func curve\(\) -> PyreonFlowPathResult/)
    // Kotlin infers an expression-bodied function's type itself; the Swift annotation is what was missing.
    expect(transform(edgeSource('curve'), { target: 'kotlin' }).code).toMatch(/fun curve\(\) = pyreonBezierPath/)
  })
  it.skipIf(!isKotlincAvailable())('and type-checks on Kotlin', () => {
    const v = validateKotlin(transform(edgeSource('curve'), { target: 'kotlin' }).code, FIRST_PARTY_VALIDATE_OPTIONS)
    expect(v.ok, v.ok ? '' : String((v as { error?: string }).error)).toBe(true)
  })
  it('an alias of the prop under its own name is NOT a collision (the common destructure-ish shape)', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
export function Card(props: { title: string }) {
  const title = props.title
  return <Stack><Text>{title}</Text></Stack>
}`
    expect(transform(src, { target: 'swift' }).warnings.join('\n')).not.toMatch(/same name as the prop/)
  })
})

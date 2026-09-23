// A block-bodied handler with ONE statement is collapsed to the lean
// expression-body arrow shape. An assignment is a STATEMENT in the IR, so that
// collapse handed `flow.config.reducedMotion = false` to `parseExpr`, which
// rejects `AssignmentExpression` — the handler emitted EMPTY on both targets
// (with a warning naming the syntax, not the drop), while the two-statement
// spelling of the same intent lowered fine. Found writing the F3 flow device
// proof; the single-statement form is the one an author writes first.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const src = (body: string) => `
  import { signal } from '@pyreon/reactivity'
  import { Button, Stack, Text } from '@pyreon/primitives'
  import { createFlow, Flow } from '@pyreon/flow'
  export function Diagram() {
    const flow = createFlow<{ label: string }>({ nodes: [], edges: [], reducedMotion: true })
    let taps = 0
    return <Stack><Flow instance={flow} /><Button onPress={() => ${body}}><Text>Allow motion</Text></Button></Stack>
  }
`

describe('single-statement block handler holding an assignment', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`[${target}] lowers a lone config assignment instead of emitting an empty handler`, () => {
      const result = transform(src('{ flow.config.reducedMotion = false }'), { target })
      expect(result.warnings ?? []).toEqual([])
      expect(result.code).toContain('flow.reducedMotion = false')
      const validation = target === 'swift' ? validateSwiftWithStubs(result.code) : validateKotlin(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    })
    it(`[${target}] emits byte-identically to the two-statement spelling minus the second statement`, () => {
      const single = transform(src('{ flow.config.reducedMotion = false }'), { target }).code
      const double = transform(src('{ flow.config.reducedMotion = false; flow.config.snapToGrid = false }'), { target }).code
      expect(double.replace(/\n\s*flow\.snapToGrid = false/, '')).toBe(single)
    })
  }
})

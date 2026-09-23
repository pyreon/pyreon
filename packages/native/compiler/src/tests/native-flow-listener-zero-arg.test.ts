// A flow listener subscriber that IGNORES its argument — `flow.onConnectStart(() =>
// { starts.set(starts() + 1) })`, ordinary web code — emitted a zero-parameter
// Swift closure where the port's callback type takes one, and swiftc refused
// the whole component ("contextual type for closure argument list expects 1
// argument"). Kotlin's one-parameter lambda accepts the bare form, so the same
// source built on Android and not on iOS. Found writing the F3 flow device proof.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const src = `
  import { signal, onMount } from '@pyreon/reactivity'
  import { Stack, Text } from '@pyreon/primitives'
  import { createFlow, Flow } from '@pyreon/flow'
  export function Diagram() {
    const flow = createFlow<{ label: string }>({ nodes: [], edges: [] })
    const starts = signal(0)
    onMount(() => { flow.onConnectStart(() => { starts.set(starts() + 1) }) })
    return <Stack><Flow instance={flow} /><Text>{starts()}</Text></Stack>
  }
`

describe('flow listener with a zero-parameter subscriber', () => {
  it('[swift] emits a closure that accepts the callback argument', () => {
    const result = transform(src, { target: 'swift' })
    expect(result.warnings ?? []).toEqual([])
    expect(result.code).toContain('flow.onConnectStart({ _ in')
    const validation = validateSwiftWithStubs(result.code)
    expect(validation.ok, validation.error ?? '').toBe(true)
  })
  it('[kotlin] keeps the bare lambda, which Kotlin accepts for a one-parameter callback', () => {
    const result = transform(src, { target: 'kotlin' })
    expect(result.warnings ?? []).toEqual([])
    const validation = validateKotlin(result.code)
    expect(validation.ok, validation.error ?? '').toBe(true)
  })
  it('[swift] leaves a subscriber that names its argument alone', () => {
    const named = src.replace('flow.onConnectStart(() =>', 'flow.onConnectStart((start) =>')
    expect(transform(named, { target: 'swift' }).code).toContain('flow.onConnectStart({ start in')
  })
})

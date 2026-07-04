// Kotlin: a Phase-5 native-container reactive FIELD read via the web
// signal-read idiom `ws.lastMessage()` must drop the call parens and read the
// Compose `MutableState` property `.value` — NOT `.value()`, which invokes the
// value (`String?`) as a function (`expression 'value' … cannot be invoked as
// a function`, a real kotlinc error). The bare-member read `ws.error` already
// emits `.value`; the CALL form (with parens) was the gap.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { useWebSocket } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const ws = useWebSocket("wss://example.com/feed")
  ${body}
}`

describe('Kotlin: native-container reactive-field CALL read → `.value` (not `.value()`)', () => {
  it('`ws.lastMessage()` → `ws.lastMessage.value` (parens dropped)', () => {
    const out = transform(
      app(`return (<Stack><Text>{ws.lastMessage()}</Text></Stack>)`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('ws.lastMessage.value')
    expect(out).not.toContain('ws.lastMessage.value()')
  })

  it('the bare-member read `ws.isConnected` keeps its `.value` byte-shape', () => {
    const out = transform(
      app(`return (<Stack><Text>{String(ws.isConnected)}</Text></Stack>)`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('ws.isConnected.value')
  })

  it('a real METHOD call keeps its parens (`ws.send("x")` unchanged)', () => {
    const out = transform(
      app(`return (<Stack><Button onPress={() => ws.send("x")}>go</Button></Stack>)`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('ws.send("x")')
  })

  it.skipIf(!isKotlincAvailable())('the field-call read compiles via kotlinc', () => {
    const out = transform(
      app(`return (<Stack><Text>{ws.lastMessage()}</Text></Stack>)`),
      { target: 'kotlin' },
    ).code
    const r = validateKotlin(out)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

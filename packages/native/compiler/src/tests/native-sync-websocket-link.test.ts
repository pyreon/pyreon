// OFF-1: `connectPyreonSync(doc, webSocketChannel(url))` lowers to the native
// transport over the native WebSocket channel. Before, the call had no
// lowering: the doc and its synced signals ran natively but never reached a
// relay, so two devices could only converge through a hand-carried state dump.

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const SRC = `import { connectPyreonSync, PyreonCrdtDoc, syncedSignal, webSocketChannel } from '@pyreon/sync'
import { Button, Stack, Text } from '@pyreon/primitives'
export function Synced() {
  const doc = new PyreonCrdtDoc('device')
  const title = syncedSignal({ doc, key: 'title', initial: 'none' })
  const link = connectPyreonSync(doc, webSocketChannel('ws://localhost:8792/sync'))
  return (
    <Stack>
      <Text>Title: {title()}</Text>
      <Button onPress={() => title.set('from-device')}>Write</Button>
      <Button onPress={() => link.disconnect()}>Disconnect</Button>
    </Stack>
  )
}`

describe('connectPyreonSync over webSocketChannel', () => {
  it('Swift: a transport opened on appear, disposed on disappear and by disconnect()', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('@State private var link: PyreonSyncTransport? = nil')
    expect(out.code).toContain(
      'if link == nil, let channel = PyreonSyncWebSocketChannel(url: "ws://localhost:8792/sync") {',
    )
    expect(out.code).toContain('link = PyreonSyncTransport(doc: doc, channel: channel)')
    expect(out.code).toMatch(/\.onDisappear \{\s*link\?\.dispose\(\)\s*link = nil/)
    expect(out.code).toContain('Button("Disconnect") { link?.dispose() }')
  })

  it('Kotlin: a DisposableEffect owns the transport; disconnect() disposes it', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('var link by remember { mutableStateOf<PyreonSyncTransport?>(null) }')
    expect(out.code).toContain(
      'val transport = PyreonSyncTransport(doc, PyreonSyncWebSocketChannel("ws://localhost:8792/sync"))',
    )
    expect(out.code).toMatch(/onDispose \{\s*transport\.dispose\(\)\s*link = null/)
    expect(out.code).toContain('onClick = { link?.dispose() }')
  })

  it('a custom channel is refused by name, never emitted verbatim', () => {
    const custom = SRC.replace("webSocketChannel('ws://localhost:8792/sync')", 'myChannel')
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(custom, { target })
      expect(out.warnings.join('\n')).toContain('connectPyreonSync `link`: native lowers')
      expect(out.code).not.toContain('connectPyreonSync(')
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })
})

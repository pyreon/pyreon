// `useWebSocket` and `useGeolocation` had no Swift stub, so neither could be
// type-checked on that platform at all — the first two entries removed from
// `stub-coverage-ratchet.test.ts`'s KNOWN_UNCOVERED list.
//
// The ratchet asserts a stub EXISTS. These assert it is USABLE: emit a real
// app for each hook and type-check the result. A stub can satisfy the former
// and still be wrong for the latter — which happened while writing these. The
// first `PyreonGeolocation` stub carried `public override init()`, copied
// verbatim from the runtime, where it is correct because the real class
// subclasses NSObject for CLLocationManagerDelegate. The stub has no
// superclass, so it failed with `initializer does not override a designated
// initializer from its superclass`.
//
// That is the useful shape of the lesson: a stub mirrors the surface the EMIT
// USES, not the source text of the runtime. The emit only ever writes
// `PyreonGeolocation()`, so a plain `init()` is both correct and sufficient —
// and copying more than that is how a stub drifts into either masking or
// noise.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwiftWithStubs } from '../validate'

const WEBSOCKET = `import { useWebSocket } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'
export function Room() {
  const ws = useWebSocket('wss://example.com/room')
  return (
    <Stack>
      <Text>Open: {ws.isConnected}</Text>
      <Text>Last: {ws.lastMessage}</Text>
      <Button onPress={() => ws.send('ping')}>Send</Button>
    </Stack>
  )
}`

const GEOLOCATION = `import { useGeolocation } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'
export function Where() {
  const geo = useGeolocation()
  return (
    <Stack>
      <Text>Lat: {geo.latitude}</Text>
      <Button onPress={() => geo.start()}>Start</Button>
    </Stack>
  )
}`

const swift = (src: string) => transform(src, { target: 'swift' }).code

describe('newly-stubbed service hooks type-check on Swift', () => {
  it('useWebSocket emits a connect with the `to:` label the runtime declares', () => {
    const out = swift(WEBSOCKET)
    expect(out).toContain('@State private var ws = PyreonWebSocket()')
    // Argument labels are a TYPE-level concern — exactly the class that shipped
    // broken in `useDatabase` for months because nothing type-checked it.
    expect(out).toContain('ws.connect(to: URL(string: "wss://example.com/room")!)')
    expect(out).toContain('ws.send("ping")')
  })

  it('useGeolocation emits a plain container and a no-arg start', () => {
    const out = swift(GEOLOCATION)
    expect(out).toContain('@State private var geo = PyreonGeolocation()')
    expect(out).toContain('geo.start()')
  })

  it('emits no warnings for either', () => {
    expect(transform(WEBSOCKET, { target: 'swift' }).warnings ?? []).toEqual([])
    expect(transform(GEOLOCATION, { target: 'swift' }).warnings ?? []).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('the emitted useWebSocket Swift type-checks', () => {
    const res = validateSwiftWithStubs(swift(WEBSOCKET))
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('the emitted useGeolocation Swift type-checks', () => {
    const res = validateSwiftWithStubs(swift(GEOLOCATION))
    expect(res.ok, res.error ?? '').toBe(true)
  })

  // The stubs must reject what the real runtime rejects. Every reactive field
  // on both containers is `private(set)`, so an emit that assigned to one must
  // not sail through.
  it.skipIf(!isSwiftcAvailable())('the stubs REJECT writes to read-only reactive fields', () => {
    const badWs = swift(WEBSOCKET).replace('ws.send("ping")', 'ws.isConnected = true')
    expect(validateSwiftWithStubs(badWs).ok).toBe(false)

    const badGeo = swift(GEOLOCATION).replace('geo.start()', 'geo.latitude = 1.0')
    expect(validateSwiftWithStubs(badGeo).ok).toBe(false)
  })
})

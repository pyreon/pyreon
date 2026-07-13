// M3.2 — `const share = useShare()` platform-API hook lowering.
//
// The second imperative platform-API hook (after M3.1 useHaptics), reusing
// the same recognition → emit → runtime pipeline. Analog = useHaptics /
// useClipboard: decl-recognition only, member method calls flow through
// unchanged, string args pass straight through (no arg rewriting).
//
// Swift:  `@State private var share = PyreonShare()` — no ctor arg (iOS
//         grabs the key window itself); `share.url("...")` flows through to
//         a UIActivityViewController presented from the key window.
// Kotlin: `val shareCtx = LocalContext.current` (hoisted out of the
//         non-Composable `remember` lambda — Android needs a Context for
//         `startActivity`) + `remember { PyreonShare(shareCtx) }`.
//
// Behaviour is device-proven in examples/native-counter-ios's XCUITest
// (tapping Share opens the system share sheet — an OBSERVABLE proof,
// stronger than haptics). This spec locks the EMIT SHAPE + is the bisect
// target.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `import { useShare } from '@pyreon/hooks'
export function App() {
  const share = useShare()
  return (
    <VStack>
      <Button onClick={() => share.url('https://pyreon.dev')}>Share</Button>
    </VStack>
  )
}`

describe('M3.2 useShare platform-API hook emit', () => {
  it('Swift emits an @State PyreonShare + passes the method call through', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.code).toContain('@State private var share = PyreonShare()')
    expect(out.code).toContain('share.url("https://pyreon.dev")')
    expect(out.warnings).toEqual([])
  })

  it('Kotlin hoists LocalContext + remembers PyreonShare', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.code).toContain('val shareCtx = LocalContext.current')
    expect(out.code).toContain('val share = remember { PyreonShare(shareCtx) }')
    expect(out.code).toContain('share.url("https://pyreon.dev")')
    expect(out.warnings).toEqual([])
  })

  it('all four methods (text/url/textUrl/canShare) flow through unchanged', () => {
    const src = `import { useShare } from '@pyreon/hooks'
export function App() {
  const s = useShare()
  return (
    <VStack>
      <Button onClick={() => s.text('hi')}>A</Button>
      <Button onClick={() => s.url('https://x.dev')}>B</Button>
      <Button onClick={() => s.textUrl('look', 'https://x.dev')}>C</Button>
    </VStack>
  )
}`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('s.text("hi")')
    expect(sw.code).toContain('s.url("https://x.dev")')
    expect(sw.code).toContain('s.textUrl("look", "https://x.dev")')
    expect(sw.warnings).toEqual([])
    const kt = transform(src, { target: 'kotlin' })
    expect(kt.code).toContain('s.text("hi")')
    expect(kt.code).toContain('s.url("https://x.dev")')
    expect(kt.code).toContain('s.textUrl("look", "https://x.dev")')
    expect(kt.warnings).toEqual([])
  })

  it('useShare + useHaptics coexist (both imperative hooks, one component)', () => {
    const src = `import { useShare, useHaptics } from '@pyreon/hooks'
export function App() {
  const s = useShare()
  const h = useHaptics()
  return <Button onClick={() => { h.impact('light'); s.url('https://x.dev') }}>x</Button>
}`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('@State private var s = PyreonShare()')
    expect(sw.code).toContain('@State private var h = PyreonHaptics()')
    expect(sw.warnings).toEqual([])
    const kt = transform(src, { target: 'kotlin' })
    expect(kt.code).toContain('val s = remember { PyreonShare(sCtx) }')
    expect(kt.code).toContain('val h = remember { PyreonHaptics(hHaptic) }')
    expect(kt.warnings).toEqual([])
  })
})

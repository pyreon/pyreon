// M3.2b — `const linking = useLinking()` platform-API hook lowering.
//
// The third imperative platform-API hook (after haptics + share), reusing
// the same recognition → emit → runtime pipeline. Analog = useShare:
// decl-recognition only, member method call flows through unchanged, string
// arg passes straight through (no arg rewriting).
//
// Swift:  `@State private var linking = PyreonLinking()` — no ctor arg;
//         `linking.openUrl("...")` flows through to `UIApplication.shared.open`.
// Kotlin: `val linkingCtx = LocalContext.current` + `remember { PyreonLinking(linkingCtx) }`
//         (Android needs a Context for `startActivity(ACTION_VIEW)`).
//
// Behaviour is device-proven in examples/native-counter-ios's XCUITest
// (tapping Open backgrounds the app / foregrounds Safari — an observable
// proof). This spec locks the EMIT SHAPE + is the bisect target.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `import { useLinking } from '@pyreon/hooks'
export function App() {
  const linking = useLinking()
  return <Button onClick={() => linking.openUrl('https://pyreon.dev')}>Open</Button>
}`

describe('M3.2b useLinking platform-API hook emit', () => {
  it('Swift emits an @State PyreonLinking + passes openUrl through', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.code).toContain('@State private var linking = PyreonLinking()')
    expect(out.code).toContain('linking.openUrl("https://pyreon.dev")')
    expect(out.warnings).toEqual([])
  })

  it('Kotlin hoists LocalContext + remembers PyreonLinking', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.code).toContain('val linkingCtx = LocalContext.current')
    expect(out.code).toContain('val linking = remember { PyreonLinking(linkingCtx) }')
    expect(out.code).toContain('linking.openUrl("https://pyreon.dev")')
    expect(out.warnings).toEqual([])
  })

  it('useLinking + useShare + useHaptics coexist (three imperative hooks, one component)', () => {
    const src = `import { useLinking, useShare, useHaptics } from '@pyreon/hooks'
export function App() {
  const l = useLinking()
  const s = useShare()
  const h = useHaptics()
  return <Button onClick={() => { h.impact('light'); s.url('https://x.dev'); l.openUrl('https://x.dev') }}>x</Button>
}`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('@State private var l = PyreonLinking()')
    expect(sw.code).toContain('@State private var s = PyreonShare()')
    expect(sw.code).toContain('@State private var h = PyreonHaptics()')
    expect(sw.warnings).toEqual([])
    const kt = transform(src, { target: 'kotlin' })
    expect(kt.code).toContain('val l = remember { PyreonLinking(lCtx) }')
    expect(kt.code).toContain('val s = remember { PyreonShare(sCtx) }')
    expect(kt.warnings).toEqual([])
  })
})

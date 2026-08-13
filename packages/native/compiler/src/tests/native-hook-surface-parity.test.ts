// The Swift STUBS were narrower than the real runtimes, so the type gate
// rejected correct emits — the mirror of the documented superset-stub trap,
// and just as costly because it fails WORKING code.
//
// Measured, not guessed: `PyreonShare` shipped a stub with only `url` while
// the runtime has `text` / `url` / `textUrl` / `canShare`; `PyreonHaptics`
// had only `impact` against a runtime with three; `PyreonNotifications` had
// only `notify`. Every one of those members is reachable from the web hook,
// so a component using them compiled on the web and was rejected here.
//
// This suite compiles the WEB-CORRECT spelling of each hook's surface. It is
// deliberately not a string comparison against the stub text: what matters
// is whether real code type-checks, and only the toolchain can answer that.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwiftWithStubs } from '../validate'

/** (hook, decl, a body exercising the members a web author would reach for) */
const SURFACES: ReadonlyArray<readonly [string, string, string]> = [
  ['useShare', 'const s = useShare()', 's.text("hi"); s.url("u"); s.textUrl("a", "b")'],
  ['useHaptics', 'const h = useHaptics()', 'h.impact("light"); h.notification("success"); h.selection()'],
  ['useNotifications', 'const n = useNotifications()', 'n.requestPermission(); n.notify("t", "b")'],
  ['useBiometrics', 'const b = useBiometrics()', 'const ok = b.isAvailable()'],
  ['useClipboard', 'const c = useClipboard()', 'c.copy("hi")'],
]

const app = (decl: string, body: string) => `import { Button } from '@pyreon/primitives'
export function App() {
  ${decl}
  const go = () => { ${body} }
  return <Button onPress={() => go()}>go</Button>
}`

describe('every lowered hook member a web author can reach type-checks', () => {
  for (const [hook, decl, body] of SURFACES) {
    it.skipIf(!isSwiftcAvailable())(`${hook}`, () => {
      const out = transform(app(decl, body), { target: 'swift' })
      const r = validateSwiftWithStubs(out.code)
      expect(r.ok, r.error ?? '').toBe(true)
    })
  }
})

describe('the read surfaces that are STATE, not methods', () => {
  // `copied` / `text` are accessors on the web and stored properties
  // natively, so the read has to drop its parens or the documented spelling
  // fails. Covered in depth by native-clipboard-read-inversion.test.ts; kept
  // here so the surface sweep exercises it too.
  it.skipIf(!isSwiftcAvailable())('useClipboard reads', () => {
    const src = `import { Text } from '@pyreon/primitives'
export function App() {
  const c = useClipboard()
  return <Text>{c.copied() ? c.text() : ''}</Text>
}`
    const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

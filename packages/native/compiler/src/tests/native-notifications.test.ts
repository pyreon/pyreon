// M3.3 — `const notifs = useNotifications()` LOCAL-notification hook lowering.
//
// The fourth imperative platform-API hook (after haptics/share/linking),
// reusing the same recognition -> emit -> runtime pipeline. Analog =
// useShare: decl-recognition only, member method calls flow through
// unchanged, string args pass straight through (no arg rewriting).
//
// Swift:  `@State private var notifs = PyreonNotifications()` — no ctor arg;
//         `notifs.notify("t","b")` flows through to UNUserNotificationCenter.
// Kotlin: `val notifsCtx = LocalContext.current` + `remember { PyreonNotifications(notifsCtx) }`
//         (Android NotificationManager needs a Context).
//
// Distinct from usePush (which RECEIVES remote push). This spec locks the
// EMIT SHAPE + is the bisect target.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `import { useNotifications } from '@pyreon/hooks'
export function App() {
  const notifs = useNotifications()
  return <Button onClick={() => notifs.notify('Saved', 'Your changes are saved')}>Notify</Button>
}`

describe('M3.3 useNotifications platform-API hook emit', () => {
  it('Swift emits an @State PyreonNotifications + passes notify through', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.code).toContain('@State private var notifs = PyreonNotifications()')
    expect(out.code).toContain('notifs.notify("Saved", "Your changes are saved")')
    expect(out.warnings).toEqual([])
  })

  it('Kotlin hoists LocalContext + remembers PyreonNotifications', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.code).toContain('val notifsCtx = LocalContext.current')
    expect(out.code).toContain('val notifs = remember { PyreonNotifications(notifsCtx) }')
    expect(out.code).toContain('notifs.notify("Saved", "Your changes are saved")')
    expect(out.warnings).toEqual([])
  })

  it('notify + requestPermission both flow through unchanged', () => {
    const src = `import { useNotifications } from '@pyreon/hooks'
export function App() {
  const n = useNotifications()
  return (
    <VStack>
      <Button onClick={() => n.requestPermission()}>Ask</Button>
      <Button onClick={() => n.notify('hi', 'there')}>Post</Button>
    </VStack>
  )
}`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('n.requestPermission()')
    expect(sw.code).toContain('n.notify("hi", "there")')
    expect(sw.warnings).toEqual([])
    const kt = transform(src, { target: 'kotlin' })
    expect(kt.code).toContain('n.requestPermission()')
    expect(kt.code).toContain('n.notify("hi", "there")')
    expect(kt.warnings).toEqual([])
  })
})

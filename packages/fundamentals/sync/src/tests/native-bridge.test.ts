import { describe, expect, it } from 'vitest'
import { createNativeSyncHost } from '../crdt/native-bridge'

describe('native sync bridge (JS side of the native host contract)', () => {
  it('observe seeds current value then fires on change; set writes', () => {
    const host = createNativeSyncHost({ actor: 'device-1' }) // local-only (no url)
    const seen: unknown[] = []
    const off = host.observe('doc', 'title', (v) => seen.push(v))
    expect(seen).toEqual([undefined]) // seeded immediately
    host.set('doc', 'title', 'Hello')
    expect(seen).toEqual([undefined, 'Hello'])
    expect(host.has('doc', 'title')).toBe(true)
    off()
    host.set('doc', 'title', 'After') // no more callbacks after unsubscribe
    expect(seen).toEqual([undefined, 'Hello'])
    host.destroy()
  })
})

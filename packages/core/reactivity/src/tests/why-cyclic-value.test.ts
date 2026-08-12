// `why()` must survive a CYCLIC signal value.
//
// It used to interpolate `JSON.stringify(e.prev)` directly, which throws
// `TypeError: cannot serialize cyclic structures`. Cyclic values in signals are
// ordinary — a DOM node, a store with a back-reference, a Yjs doc, any class
// instance with a parent pointer — so this was not an exotic input.
//
// Three failures compounded, and the third is the one that matters:
//
//   1. the throw landed inside the signal-write path;
//   2. the framework's trace guard caught it and printed "signal trace
//      listener threw — listener is buggy", blaming the USER's listener when
//      the buggy listener was Pyreon's own `why()`;
//   3. `_whyLog.push` never ran, so `why()` concluded "No signal updates
//      detected" — a debugging tool reporting that nothing happened, at
//      exactly the moment something did.
//
// The fix reuses `preview()` from reactive-trace.ts, which was already
// cycle-safe and whose own comment names this hazard. The lesson had been
// learned in one file and not applied in its sibling.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { signal } from '../signal'
import { why } from '../debug'

afterEach(() => {
  vi.restoreAllMocks()
})

const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(() => r()))

describe('why() with a cyclic signal value', () => {
  it('does not throw out of the signal write', () => {
    const cyclic: Record<string, unknown> = { name: 'node' }
    cyclic.self = cyclic
    const s = signal<unknown>(null)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    why()
    expect(() => s.set(cyclic)).not.toThrow()
  })

  it('LOGS the update instead of reporting that nothing happened', async () => {
    const cyclic: Record<string, unknown> = { name: 'node' }
    cyclic.self = cyclic
    const s = signal<unknown>(null, { name: 'doc' })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    why()
    s.set(cyclic)
    await flushMicrotasks()

    const lines = log.mock.calls.map((c) => String(c[0]))
    // The update is reported…
    expect(lines.some((l) => l.includes('[pyreon:why]') && l.includes('"doc"'))).toBe(true)
    // …and the false conclusion is gone. This is the load-bearing assertion:
    // a debugger that says "nothing happened" is worse than one that crashes,
    // because it sends the reader off to look somewhere else entirely.
    expect(lines.some((l) => l.includes('No signal updates detected'))).toBe(false)
  })

  it('renders the cyclic value as a shape hint rather than dropping it', async () => {
    const cyclic: Record<string, unknown> = { name: 'node' }
    cyclic.self = cyclic
    const s = signal<unknown>(null)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    why()
    s.set(cyclic)
    await flushMicrotasks()
    const line = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes('[pyreon:why]'))
    expect(line).toBeDefined()
    // Keys, not a serialization — enough to recognise the value.
    expect(line).toContain('name')
    expect(line).toContain('self')
  })

  it('still formats ordinary values readably', async () => {
    const s = signal(3, { name: 'count' })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    why()
    s.set(5)
    await flushMicrotasks()
    const line = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes('[pyreon:why]'))
    expect(line).toContain('"count"')
    expect(line).toContain('3')
    expect(line).toContain('5')
  })
})

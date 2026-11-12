import { describe, expect, it } from 'vitest'
import { buildHydrationReport } from '../dev-overlay'

describe('buildHydrationReport', () => {
  const ctx = {
    type: 'text' as const,
    expected: 'Rendered in the browser',
    actual: 'Rendered on the server',
    path: 'root > div > p > text',
    timestamp: 0,
  }

  it('uses the runtime’s own warning text, so the diagnose catalog can match it', () => {
    const r = buildHydrationReport(ctx, undefined, 0)
    expect(r.kind).toBe('hydration')
    expect(r.message).toBe(
      '[Pyreon] Hydration mismatch (text): expected Rendered in the browser, got Rendered on the server at root > div > p > text',
    )
    expect(r.fix?.fix).toContain('byte-identical')
  })

  it('names the server HTML (the DOM it found) and the client render (what the VNode expected)', () => {
    expect(buildHydrationReport(ctx, undefined, 0).details).toEqual([
      { label: 'Server HTML', value: '"Rendered on the server"' },
      { label: 'Client render', value: '"Rendered in the browser"' },
      { label: 'Where', value: 'root > div > p > text' },
    ])
    // Tag mismatches are element names, not quoted text.
    const tag = buildHydrationReport({ ...ctx, type: 'tag', expected: 'div', actual: 'section' }, undefined, 0)
    expect(tag.details?.[0]).toEqual({ label: 'Server HTML', value: 'section' })
  })

  it('has no file location: the runtime only knows the DOM path', () => {
    const r = buildHydrationReport(ctx, 'Error: x\n    at warn (http://localhost:5173/@fs/p/runtime-dom/src/hydrate.ts:1:1)', 0)
    expect(r.location).toBeUndefined()
    expect(r.frame).toBeUndefined()
    expect(r.stack[0]?.library).toBe(true)
  })

  it('counts the other mismatches in a note', () => {
    expect(buildHydrationReport(ctx, undefined, 0).note).toBeUndefined()
    expect(buildHydrationReport(ctx, undefined, 1).note).toBe('1 more mismatch on this page; see the console.')
    expect(buildHydrationReport(ctx, undefined, 3).note).toBe('3 more mismatches on this page; see the console.')
  })
})

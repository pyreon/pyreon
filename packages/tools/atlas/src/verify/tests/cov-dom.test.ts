/**
 * `ensureDom` — how a DOM is obtained, and what happens when one cannot be.
 *
 * Three outcomes, and the difference between them is a verdict:
 *
 *   an AMBIENT document      → use it. Installing a second is worse than
 *                              useless — the component mounts into one while
 *                              the framework's module-level state (delegation
 *                              roots, the styler sheet) points at the other.
 *   happy-dom installed      → the ordinary Node path.
 *   neither                  → `{ ok: false, reason }`, which every caller
 *                              turns into a SKIP carrying that reason. Never a
 *                              pass: "nothing examined this" presenting as
 *                              "clean" is what `checked` exists to prevent.
 *
 * The ambient arms are reached by giving the module a real ambient `document`
 * BEFORE it — and `@pyreon/reactivity`, whose `isClient` is the discriminator —
 * is evaluated. That is the genuine browser-context shape, not a mock of the
 * check: `vi.resetModules()` + a fresh dynamic import is what makes the
 * module-load-time constant read `true`.
 *
 * `happy-dom` is an OPTIONAL PEER, so its absent and malformed shapes are
 * reachable only by controlling the import. Both are real deployments — a
 * consumer who never installed it, and one whose copy resolves without the
 * export — and both must degrade to a reason rather than a crash.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'

const KEY = 'document'
type Host = Record<string, unknown>
const host = globalThis as unknown as Host

/** Install `value` at a global key, returning an exact restore. */
function install(key: string, value: unknown): () => void {
  const previous = Object.getOwnPropertyDescriptor(host, key)
  Object.defineProperty(host, key, { value, configurable: true, writable: true })
  return () => {
    if (previous) Object.defineProperty(host, key, previous)
    else delete host[key]
  }
}

const restores: (() => void)[] = []
afterEach(() => {
  while (restores.length > 0) restores.pop()!()
  vi.doUnmock('happy-dom')
  vi.resetModules()
})

beforeEach(() => {
  vi.resetModules()
})

/** Import `ensureDom` from a FRESH module graph, so `isClient` is re-derived. */
async function freshEnsureDom() {
  const mod = await import('../dom')
  return mod.ensureDom
}

describe('ensureDom — an ambient document wins', () => {
  it('ADOPTS an existing document rather than installing a second one', async () => {
    // The whole reason this branch exists. Two DOMs in one process is the
    // documented split: the component mounts into one, the framework's
    // module-level state points at the other.
    const win = new Window({ url: 'http://localhost' })
    restores.push(install(KEY, win.document))

    const ensureDom = await freshEnsureDom()
    const result = await ensureDom()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.env.kind, 'reported as ambient, so a verdict is legible').toBe('ambient')
    expect(result.env.document, 'the SAME document, not a copy').toBe(win.document)
    expect(() => result.env.teardown(), 'tearing down an adopted DOM is a no-op').not.toThrow()
    // Twice, because `teardown` is documented safe to call twice.
    expect(() => result.env.teardown()).not.toThrow()
  })

  it('does NOT adopt a document that cannot create elements', async () => {
    // `isClient` says a document EXISTS, not that it is usable — a runner that
    // installed a stub would otherwise hand the harness something it cannot
    // mount into, and every scenario would fail on the stub rather than on the
    // component.
    restores.push(install(KEY, { title: 'a stub, with no createElement' }))

    const ensureDom = await freshEnsureDom()
    const result = await ensureDom()

    expect(result.ok, 'it fell through to happy-dom').toBe(true)
    if (!result.ok) return
    expect(result.env.kind).toBe('happy-dom')
    result.env.teardown()
  })
})

describe('ensureDom — when happy-dom cannot be had', () => {
  it('reports a REASON naming the remedy when the import fails', async () => {
    // The optional peer is not installed. The caller turns this into a skip,
    // and the reason is the whole of what a reader gets.
    vi.doMock('happy-dom', () => {
      throw new Error('Cannot find package')
    })

    const ensureDom = await freshEnsureDom()
    const result = await ensureDom()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('no DOM available')
    expect(result.reason, 'and name what to install').toContain('happy-dom')
  })

  it('reports a module that resolved WITHOUT a `Window` export', async () => {
    // Distinct from "not installed": the remedy is different, and one shared
    // message sends the reader down the wrong one.
    vi.doMock('happy-dom', () => ({ default: {}, Window: undefined }))

    const ensureDom = await freshEnsureDom()
    const result = await ensureDom()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('without a `Window` export')
  })
})

describe('ensureDom — the happy-dom path it normally takes', () => {
  it('installs the globals the runtime reaches for, and restores them exactly', async () => {
    // Every replaced key is recorded with its ORIGINAL descriptor, INCLUDING
    // the absent case — so a later `typeof document !== 'undefined'` sees the
    // same answer it saw before. Leaving an `undefined` binding behind is a
    // different answer.
    const ensureDom = await freshEnsureDom()
    const before = Object.hasOwn(host, 'document')

    const result = await ensureDom()
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.env.kind).toBe('happy-dom')
    expect(typeof (host['document'] as Document | undefined)?.createElement).toBe('function')
    expect(host['Element'], 'and the constructors, not only `document`').toBeDefined()

    result.env.teardown()
    expect(Object.hasOwn(host, 'document'), 'restored to its ORIGINAL presence').toBe(before)
  })

  it('tears down only once, so a double teardown cannot un-restore', async () => {
    const ensureDom = await freshEnsureDom()
    const result = await ensureDom()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    result.env.teardown()
    const after = Object.hasOwn(host, 'document')
    result.env.teardown()
    expect(Object.hasOwn(host, 'document')).toBe(after)
  })
})

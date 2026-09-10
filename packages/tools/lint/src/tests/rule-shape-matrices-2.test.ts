/**
 * Shape matrices for the reactivity, async, router and server rules.
 *
 * Same reasoning as the first matrix file: the fires-invariant proves a rule
 * CAN report, once, for one shape. What decides whether it is worth having is
 * the recognition surface — and for these rules the surface is the whole
 * product, because every one of them is about a defect that has several
 * ordinary spellings and one correct form that must stay silent.
 *
 * The quiet cases carry the weight. A rule that reports the corrected code is
 * not a stricter rule, it is a rule someone switches off — and switching it off
 * removes the protection for the shapes it DID catch.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const DEPS = [
  '@pyreon/core',
  '@pyreon/reactivity',
  '@pyreon/runtime-dom',
  '@pyreon/router',
  '@pyreon/query',
  '@pyreon/zero',
]
const SIG = `import { signal, computed, effect, batch, untrack } from '@pyreon/reactivity'\n`

let root = ''
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-shapes2-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@pyreon/shape-fixture-2',
      dependencies: Object.fromEntries(DEPS.map((d) => [d, '*'])),
    }),
  )
})
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

const run = (ruleId: string, file: string, source: string): number => {
  const abs = join(root, file)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, source)
  const config: LintConfig = { rules: { [ruleId]: 'error' } }
  return lintFile(abs, source, allRules, config).diagnostics.filter(
    (d) => d.ruleId === ruleId,
  ).length
}

// ─── pyreon/no-unbatched-updates ─────────────────────────────────────────────

describe('no-unbatched-updates counts consecutive writes, not statements', () => {
  const ID = 'pyreon/no-unbatched-updates'
  const F = 'src/a.ts'
  const decls = `${SIG}const a = signal(0), b = signal(0), c = signal(0), d = signal(0)\n`

  it('reports three consecutive writes — the control', () => {
    expect(run(ID, F, `${decls}function go() { a.set(1); b.set(2); c.set(3) }`)).toBeGreaterThan(0)
  })

  it('reports FOUR as readily as three', () => {
    expect(
      run(ID, F, `${decls}function go() { a.set(1); b.set(2); c.set(3); d.set(4) }`),
    ).toBeGreaterThan(0)
  })

  it('does NOT count `.update` — the rule is scoped to `.set`, and says so', () => {
    // Recorded rather than assumed: the diagnostic names ``.set()`` calls, and
    // `.update` on an unknown receiver is far likelier to be someone else's
    // API than `.set` is. Widening it is a rule decision with its own
    // false-positive budget, not an oversight to patch from a test — pinning
    // the current scope is what makes widening it a visible change.
    expect(
      run(
        ID,
        F,
        `${decls}function go() { a.update((n) => n + 1); b.update((n) => n + 1); c.update((n) => n + 1) }`,
      ),
    ).toBe(0)
  })

  it('is QUIET when the writes are batched — the control for every report', () => {
    expect(
      run(ID, F, `${decls}function go() { batch(() => { a.set(1); b.set(2); c.set(3) }) }`),
    ).toBe(0)
  })

  it('is quiet for TWO writes', () => {
    // A batch of two is a wash; reporting it makes the rule fire on ordinary
    // code and teaches people to ignore it.
    expect(run(ID, F, `${decls}function go() { a.set(1); b.set(2) }`)).toBe(0)
  })

  it('still reports writes SEPARATED by other work', () => {
    // Adjacency is not the criterion and should not be: three writes on one
    // execution path are three notify cycles whatever sits between them, and
    // `batch()` wraps the whole run. A rule keyed on adjacency would be
    // satisfied by inserting a log line.
    expect(
      run(
        ID,
        F,
        `${decls}function go() { a.set(1); console.warn('x'); b.set(2); console.warn('y'); c.set(3) }`,
      ),
    ).toBeGreaterThan(0)
  })

  it('reports repeated writes to the SAME signal', () => {
    // Three writes to one signal are still three notify cycles, and every
    // subscriber runs on each — `batch()` collapses them to the last value.
    expect(
      run(ID, F, `${decls}function go() { a.set(1); a.set(2); a.set(3) }`),
    ).toBeGreaterThan(0)
  })

  it('is quiet for a receiver the file PROVES is a collection', () => {
    // `Map`/`Headers`/`URLSearchParams` all have `.set`, and populating one
    // three times is not an unbatched update. The rule keys on the
    // CONSTRUCTION in the file rather than the name — which is what lets it
    // stay loud for a signal that arrived as a prop, where the name tells it
    // nothing either.
    expect(
      run(
        ID,
        F,
        `${decls}function go() { const m = new Map(); const h = new Headers(); const p = new URLSearchParams()\n  m.set('a', 1); h.set('b', '2'); p.set('c', '3') }`,
      ),
    ).toBe(0)
  })

  it('stays LOUD for an unknown receiver, which may be a forwarded signal', () => {
    // The deliberate other side of that trade: a signal passed in as a prop or
    // a parameter has no construction to find, and going quiet on every
    // unknown `.set` would lose exactly the case a rule like this is for.
    expect(
      run(ID, F, `${decls}function go(s: any) { s.a.set(1); s.b.set(2); s.c.set(3) }`),
    ).toBeGreaterThan(0)
  })
})

// ─── pyreon/no-unguarded-async-signal-write ──────────────────────────────────

describe('no-unguarded-async-signal-write accepts every real guard', () => {
  const ID = 'pyreon/no-unguarded-async-signal-write'
  const F = 'src/a.ts'
  const decls = `${SIG}const data = signal(null)\n`

  it('reports an unguarded write after await — the control', () => {
    expect(
      run(
        ID,
        F,
        `${decls}export async function load(id: string) { const r = await fetch('/x' + id); data.set(await r.json()) }`,
      ),
    ).toBeGreaterThan(0)
  })

  it('is QUIET behind a version counter', () => {
    // The documented fix. If the rule cannot see it, the rule cannot be
    // satisfied — which is the same as not having it.
    expect(
      run(
        ID,
        F,
        `${decls}let version = 0\nexport async function load(id: string) { const v = ++version; const r = await fetch('/x' + id); if (v !== version) return; data.set(await r.json()) }`,
      ),
    ).toBe(0)
  })

  it('is quiet behind an AbortSignal check', () => {
    expect(
      run(
        ID,
        F,
        `${decls}export async function load(ac: AbortController) { const r = await fetch('/x'); if (ac.signal.aborted) return; data.set(await r.json()) }`,
      ),
    ).toBe(0)
  })

  it('is quiet behind a cancelled flag', () => {
    expect(
      run(
        ID,
        F,
        `${decls}let cancelled = false\nexport async function load() { const r = await fetch('/x'); if (cancelled) return; data.set(await r.json()) }`,
      ),
    ).toBe(0)
  })

  it('is quiet for a write BEFORE the await', () => {
    // Nothing can have superseded it yet — the write is synchronous with its
    // caller.
    expect(
      run(
        ID,
        F,
        `${decls}export async function load() { data.set(null); const r = await fetch('/x'); return r }`,
      ),
    ).toBe(0)
  })

  it('is quiet in a function with no await at all', () => {
    expect(run(ID, F, `${decls}export function go() { data.set(1) }`)).toBe(0)
  })
})

// ─── pyreon/no-imperative-navigate-in-render ─────────────────────────────────

describe('no-imperative-navigate-in-render separates render from deferred', () => {
  const ID = 'pyreon/no-imperative-navigate-in-render'
  const F = 'src/a.tsx'
  const NAV = `import { useNavigate } from '@pyreon/router'\n`

  it('reports a navigate called in the body — the control', () => {
    expect(
      run(
        ID,
        F,
        `${NAV}export function C() { const navigate = useNavigate(); navigate('/x'); return <div /> }`,
      ),
    ).toBeGreaterThan(0)
  })

  it('reports a navigate inside a body-level CONDITIONAL', () => {
    // `if (!user) navigate('/login')` is the shape people actually write, and
    // it is still a synchronous navigation during render — an infinite loop.
    expect(
      run(
        ID,
        F,
        `${NAV}export function C(props: any) { const navigate = useNavigate(); if (!props.user) navigate('/login'); return <div /> }`,
      ),
    ).toBeGreaterThan(0)
  })

  it('is QUIET in an event handler', () => {
    expect(
      run(
        ID,
        F,
        `${NAV}export function C() { const navigate = useNavigate(); return <button onClick={() => navigate('/x')} /> }`,
      ),
    ).toBe(0)
  })

  it('is quiet inside onMount', () => {
    // Deferred past render, which is the fix the message recommends.
    expect(
      run(
        ID,
        F,
        `import { onMount } from '@pyreon/core'\n${NAV}export function C() { const navigate = useNavigate(); onMount(() => navigate('/x')); return <div /> }`,
      ),
    ).toBe(0)
  })

  it('is quiet when the navigate is only STORED', () => {
    // Passing it down is not calling it.
    expect(
      run(
        ID,
        F,
        `${NAV}export function C() { const navigate = useNavigate(); return <Child go={navigate} /> }`,
      ),
    ).toBe(0)
  })

  it('is quiet for a same-named call that is not the router', () => {
    expect(
      run(ID, F, `export function C(props: any) { props.navigate('/x'); return <div /> }`),
    ).toBe(0)
  })
})

// ─── pyreon/prefer-isserver ──────────────────────────────────────────────────

describe('prefer-isserver recognises the typeof spellings', () => {
  const ID = 'pyreon/prefer-isserver'
  const F = 'src/a.ts'

  it('reports `typeof window !== undefined` — the control', () => {
    expect(
      run(ID, F, `const browser = typeof window !== 'undefined'\nexport { browser }`),
    ).toBeGreaterThan(0)
  })

  it('reports the `=== undefined` direction too', () => {
    // The server-side spelling of the same test. Recognising one direction
    // leaves half the codebase unprotected.
    expect(
      run(ID, F, `const server = typeof window === 'undefined'\nexport { server }`),
    ).toBeGreaterThan(0)
  })

  it('reports the `document` variant', () => {
    expect(
      run(ID, F, `const browser = typeof document !== 'undefined'\nexport { browser }`),
    ).toBeGreaterThan(0)
  })

  it('is QUIET when the canonical flag is imported', () => {
    expect(
      run(ID, F, `import { isClient } from '@pyreon/reactivity'\nexport { isClient }`),
    ).toBe(0)
  })

  it('is quiet for a typeof on something unrelated', () => {
    expect(
      run(ID, F, `const hasFn = typeof cb !== 'undefined'\nexport { hasFn }`),
    ).toBe(0)
  })

  it('is quiet for a typeof compared to a real type name', () => {
    // `typeof window.foo === 'function'` is a capability probe, not an
    // environment test.
    expect(
      run(ID, F, `export const ok = typeof globalThis.queueMicrotask === 'function'`),
    ).toBe(0)
  })
})

// ─── pyreon/no-catch-without-rethrow-or-report ───────────────────────────────

describe('no-catch-without-rethrow-or-report accepts any real handling', () => {
  const ID = 'pyreon/no-catch-without-rethrow-or-report'
  const F = 'src/a.ts'

  it('reports an empty catch — the control', () => {
    expect(run(ID, F, `export function f() { try { g() } catch (err) { } }`)).toBeGreaterThan(0)
  })

  it('is QUIET when the error is rethrown with a cause', () => {
    expect(
      run(
        ID,
        F,
        `export function f() { try { g() } catch (err) { throw new Error('failed', { cause: err }) } }`,
      ),
    ).toBe(0)
  })

  it('is quiet when the error is rethrown bare', () => {
    expect(run(ID, F, `export function f() { try { g() } catch (err) { throw err } }`)).toBe(0)
  })

  it('is quiet when the error is REPORTED', () => {
    expect(
      run(ID, F, `export function f() { try { g() } catch (err) { console.error(err) } }`),
    ).toBe(0)
  })

  it('is quiet when the catch returns a value DERIVED from the error', () => {
    // The documented bar, and the reason it is that bar: a return that reads
    // the error has demonstrably looked at it. A bare `return null` has not,
    // which is the swallow this rule exists for.
    expect(
      run(
        ID,
        F,
        `export function f() { try { return g() } catch (err) { return { ok: false, reason: String(err) } } }`,
      ),
    ).toBe(0)
  })

  it('still reports a catch that returns a fallback IGNORING the error', () => {
    expect(
      run(ID, F, `export function f() { try { return g() } catch (err) { return null } }`),
    ).toBeGreaterThan(0)
  })

  it('is NOT silenced by an explanatory comment alone', () => {
    // Worth pinning because the rule's own docblock calls a commented swallow
    // "a legitimate answer" — it means legitimate to a READER, not invisible
    // to the rule. A comment is not machine-checkable, so treating it as a
    // suppression would make the rule silenceable by prose; the suppression
    // mechanism is the `pyreon-lint-ignore` directive, which is greppable.
    expect(
      run(
        ID,
        F,
        `export function f() { try { g() } catch { /* the probe is best-effort; a failure means the API is absent */ } }`,
      ),
    ).toBeGreaterThan(0)
  })
})

// ─── pyreon/no-await-in-loop-over-io ─────────────────────────────────────────

describe('no-await-in-loop-over-io reports serialized IO, not every await', () => {
  const ID = 'pyreon/no-await-in-loop-over-io'
  const F = 'src/routes/api/items.ts'

  it('reports an awaited fetch per iteration — the control', () => {
    expect(
      run(
        ID,
        F,
        `export async function GET() { const out = []\n  for (const id of ids) { out.push(await fetchOne(id)) }\n  return out }`,
      ),
    ).toBeGreaterThan(0)
  })

  it('reports it in a `for` with an index too', () => {
    expect(
      run(
        ID,
        F,
        `export async function GET() { const out = []\n  for (let i = 0; i < ids.length; i++) { out.push(await fetch('/x' + ids[i])) }\n  return out }`,
      ),
    ).toBeGreaterThan(0)
  })

  it('reports it in a `while`', () => {
    expect(
      run(
        ID,
        F,
        `export async function GET() { let i = 0\n  while (i < 10) { await fetch('/x' + i); i++ }\n  return null }`,
      ),
    ).toBeGreaterThan(0)
  })

  it('is QUIET for the parallel form', () => {
    expect(
      run(
        ID,
        F,
        `export async function GET() { return await Promise.all(ids.map((id) => fetchOne(id))) }`,
      ),
    ).toBe(0)
  })

  it('is quiet for an await OUTSIDE any loop', () => {
    expect(run(ID, F, `export async function GET() { return await fetchOne('a') }`)).toBe(0)
  })

  it('is quiet for a loop with no await in it', () => {
    expect(
      run(
        ID,
        F,
        `export async function GET() { const out = []\n  for (const id of ids) { out.push(id) }\n  return out }`,
      ),
    ).toBe(0)
  })
})

// ─── pyreon/query-fn-must-forward-signal ─────────────────────────────────────

describe('query-fn-must-forward-signal follows the signal to the fetch', () => {
  const ID = 'pyreon/query-fn-must-forward-signal'
  const F = 'src/a.ts'
  const Q = `import { useQuery } from '@pyreon/query'\n`

  it('reports a queryFn that ignores the signal — the control', () => {
    expect(
      run(
        ID,
        F,
        `${Q}export const q = useQuery(() => ({ queryKey: ['a'], queryFn: () => fetch('/a') }))`,
      ),
    ).toBeGreaterThan(0)
  })

  it('accepts a queryFn that MENTIONS the signal, even if it drops it', () => {
    // Deliberate looseness, pinned so it stays deliberate: proving the signal
    // reaches the right argument object would need to know which parameter of
    // an arbitrary helper is the request options, and the rule's own docblock
    // says so. Accepting any mention costs this one miss and buys silence on
    // every codebase with an api layer — the trade that keeps the rule on.
    expect(
      run(
        ID,
        F,
        `${Q}export const q = useQuery(() => ({ queryKey: ['a'], queryFn: ({ signal }) => fetch('/a') }))`,
      ),
    ).toBe(0)
  })

  it('is QUIET when the signal reaches fetch', () => {
    expect(
      run(
        ID,
        F,
        `${Q}export const q = useQuery(() => ({ queryKey: ['a'], queryFn: ({ signal }) => fetch('/a', { signal }) }))`,
      ),
    ).toBe(0)
  })

  it('is quiet when the signal is forwarded through a helper', () => {
    // The fetch is one call away. Requiring the literal `fetch(...)` shape
    // would report every codebase with an api layer.
    expect(
      run(
        ID,
        F,
        `${Q}export const q = useQuery(() => ({ queryKey: ['a'], queryFn: ({ signal }) => api.get('/a', { signal }) }))`,
      ),
    ).toBe(0)
  })

  it('is quiet for a queryFn that does no IO', () => {
    expect(
      run(
        ID,
        F,
        `${Q}export const q = useQuery(() => ({ queryKey: ['a'], queryFn: () => cached.value }))`,
      ),
    ).toBe(0)
  })
})

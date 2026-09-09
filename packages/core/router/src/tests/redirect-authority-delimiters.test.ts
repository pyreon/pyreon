import { describe, expect, it } from 'vitest'
import { classifyHref, createRouter } from '../index'
import { classifyRedirectTarget, safeRedirectLocation } from '../redirect'
import type { RouteRecord } from '../types'

/**
 * Open redirect via BACKSLASH authority delimiters.
 *
 * `safeRedirectLocation` is emitted as a raw `Location:` header by
 * `@pyreon/server`'s `handler.ts` / `render-page.ts`, and `sanitizePath`
 * (`router.ts`) is the same guard on the client `push`/`replace` path. Both
 * blocked the protocol-relative `//host` spelling and nothing else — but the
 * WHATWG URL parser treats `\` as a synonym for `/` in a special scheme's
 * authority position, so `\\host`, `/\host`, `\/host` and `/\/host` ALL resolve
 * to `https://host/` and ALL classified as `internal`, i.e. shipped off-site.
 *
 * The fix is stated as a CLASS, not as those four spellings: a leading run of
 * TWO OR MORE characters drawn from `[/\]`, mixed in any order, introduces a
 * host. The sweep below is what holds that claim — it enumerates every prefix
 * over the delimiter alphabet up to length 3 rather than listing examples, so a
 * spelling nobody thought of cannot pass.
 *
 * The ORACLE throughout is the platform's own URL parser, never a table of
 * expected strings or a regex mirroring the implementation. The question is
 * "can what we hand back leave the origin?", and only the parser answers that;
 * a hand-written table would just re-assert the assumption that was wrong.
 * (Same discipline as `redirect-normalisation.test.ts`, whose normalisation
 * this composes with — see the interior-tab cases below.)
 */

const BASE = 'https://app.example.com/current'
const ORIGIN = new URL(BASE).origin

const TAB = String.fromCharCode(9)
const NUL = String.fromCharCode(0)

/** Does this target actually leave the origin, according to the URL parser? */
function resolvesOffOrigin(target: string): boolean {
  return originOf(target) !== ORIGIN
}

/**
 * The origin a target resolves to, or a NAMED sentinel when the parser refuses
 * it an origin at all (`//`, `/\`, … — a delimiter run with no host). Both are
 * failures, but they must FAIL DESCRIPTIVELY: letting `new URL` throw turns a
 * regression into a bare "TypeError: Invalid URL" that names neither the target
 * nor the guard, which is the one artifact a future reader gets.
 */
function originOf(target: string): string {
  try {
    return new URL(target, BASE).origin
  } catch {
    return '<no-origin: unparseable authority>'
  }
}

/** Every prefix over the delimiter alphabet, up to length 3, bare and with a host. */
function delimiterPrefixCorpus(): string[] {
  const out: string[] = []
  const walk = (prefix: string, depth: number) => {
    if (depth === 0) {
      out.push(prefix, `${prefix}evil.com`)
      return
    }
    for (const c of ['/', '\\']) walk(prefix + c, depth - 1)
  }
  for (let d = 1; d <= 3; d++) walk('', d)
  return out
}

/** The four backslash spellings from the report, plus longer mixed runs. */
const AUTHORITY_SPELLINGS: [string, string][] = [
  ['protocol-relative (already blocked)', '//evil.com'],
  ['double backslash', '\\\\evil.com'],
  ['slash then backslash', '/\\evil.com'],
  ['backslash then slash', '\\/evil.com'],
  ['slash backslash slash', '/\\/evil.com'],
  ['double slash then backslash', '//\\evil.com'],
  ['slash then double backslash', '/\\\\evil.com'],
]

const SAFE: [string, string][] = [
  ['bare path', '/ok'],
  ['path with query and hash', '/a/b?q=1#h'],
  ['root', '/'],
]

describe('classifyRedirectTarget — backslash authority delimiters', () => {
  it.each(AUTHORITY_SPELLINGS)('blocks %s', (_label, target) => {
    // Premise check: this really IS an off-origin target, per the parser. If
    // this line ever fails the test below is asserting nothing.
    expect(resolvesOffOrigin(target), `${JSON.stringify(target)} is not off-origin`).toBe(true)

    expect(classifyRedirectTarget(target).kind).toBe('block')
    expect(safeRedirectLocation(target)).toBe('/')
  })

  it.each(SAFE)('keeps %s internal', (_label, target) => {
    const c = classifyRedirectTarget(target)
    expect(c.kind).toBe('internal')
    expect(c.url).toBe(target)
    // A fix that blocks everything is not a fix: the safe target must still
    // land exactly where the browser would have taken the original.
    expect(new URL(safeRedirectLocation(target), BASE).href).toBe(new URL(target, BASE).href)
  })

  it('a SINGLE leading delimiter stays internal — the parser says it is relative', () => {
    // This boundary is read off the parser, not assumed: `\evil.com` resolves
    // to `<origin>/evil.com` and a bare `\` to `<origin>/`, exactly like their
    // `/` twins. Blocking them would be a behaviour change with no security
    // value; the assertions below prove the choice against the oracle.
    for (const target of ['\\evil.com', '\\', '/evil.com', '/']) {
      expect(resolvesOffOrigin(target), `${JSON.stringify(target)} moved origin`).toBe(false)
      expect(classifyRedirectTarget(target).kind, `${JSON.stringify(target)}`).toBe('internal')
    }
  })

  it('NEVER accepts as internal anything the URL parser resolves off-origin', () => {
    // The invariant, over the whole corpus at once. This is the assertion that
    // makes the fix a CLASS fix: it is driven by the parser's verdict, so a
    // delimiter spelling nobody enumerated still has to satisfy it.
    const corpus = [
      ...delimiterPrefixCorpus(),
      ...AUTHORITY_SPELLINGS.map(([, t]) => t),
      ...SAFE.map(([, t]) => t),
      'https://evil.com',
      'javascript:alert(1)',
      // Normalisation must COMPOSE with this guard: the tab is deleted by the
      // URL parser (and by `normaliseTarget`) before the authority is read, so
      // the delimiter run is only visible after normalising.
      `/${TAB}\\evil.com`,
      `${NUL}/\\evil.com`,
      `/${TAB}/evil.com`,
    ]

    for (const target of corpus) {
      const c = classifyRedirectTarget(target)
      if (c.kind !== 'internal') continue
      expect(
        originOf(c.url),
        `${JSON.stringify(target)} was accepted as internal as ${JSON.stringify(c.url)}`,
      ).toBe(ORIGIN)
    }
  })

  it('whatever safeRedirectLocation returns cannot leave the origin, unless explicitly external', () => {
    for (const target of [...delimiterPrefixCorpus(), `/${TAB}\\evil.com`, 'javascript:alert(1)']) {
      const out = safeRedirectLocation(target)
      expect(
        originOf(out),
        `${JSON.stringify(target)} → ${JSON.stringify(out)} escaped the origin`,
      ).toBe(ORIGIN)
    }
  })

  it('preserves the documented explicit cross-origin redirect', () => {
    // `external` is the intentional, caller-trusted case — the guard must not
    // start swallowing it. (`javascript:` stays blocked.)
    const c = classifyRedirectTarget('https://evil.com')
    expect(c.kind).toBe('external')
    expect(safeRedirectLocation('https://evil.com')).toBe('https://evil.com')
    expect(classifyRedirectTarget('javascript:alert(1)').kind).toBe('block')
    expect(safeRedirectLocation('javascript:alert(1)')).toBe('/')
  })
})

// ─── router.ts sanitizePath (same defect, same shared classification) ────────

const Home = () => null
const Ok = () => null
const Deep = () => null

const routes: RouteRecord[] = [
  { path: '/', component: Home },
  { path: '/ok', component: Ok },
  { path: '/a/b', component: Deep },
]

describe('sanitizePath (router.push / router.replace) — backslash authority delimiters', () => {
  // `sanitizePath` is module-local, so it is driven through the public
  // `push`/`replace` surface — which is also the surface an attacker reaches.
  it.each(AUTHORITY_SPELLINGS)(
    'push does not navigate off-origin for %s',
    async (_label, target) => {
      const router = createRouter({ routes, url: '/' })
      await router.push(target)
      const landed = router.currentRoute().path
      expect(
        originOf(landed),
        `push(${JSON.stringify(target)}) landed on ${JSON.stringify(landed)}`,
      ).toBe(ORIGIN)
      expect(landed).toBe('/')
    },
  )

  it.each(AUTHORITY_SPELLINGS)(
    'replace does not navigate off-origin for %s',
    async (_label, target) => {
      const router = createRouter({ routes, url: '/' })
      await router.replace(target)
      expect(router.currentRoute().path).toBe('/')
    },
  )

  it.each(SAFE)('still navigates to %s', async (_label, target) => {
    const router = createRouter({ routes, url: '/' })
    await router.push(target)
    const landed = router.currentRoute().path
    // Query/hash are split off by the router, so compare the PATH portion of
    // where the browser would have gone rather than the raw target.
    expect(landed).toBe(new URL(target, BASE).pathname)
  })

  it('an accepted push target never resolves off-origin, over the whole delimiter corpus', async () => {
    for (const target of [...delimiterPrefixCorpus(), `/${TAB}\\evil.com`, 'https://evil.com']) {
      const router = createRouter({ routes, url: '/' })
      await router.push(target)
      const landed = router.currentRoute().path
      expect(
        originOf(landed),
        `push(${JSON.stringify(target)}) landed on ${JSON.stringify(landed)}`,
      ).toBe(ORIGIN)
    }
  })

  it('a route-config redirect cannot send the visitor off-origin', async () => {
    const withRedirect: RouteRecord[] = [
      { path: '/', component: Home },
      { path: '/ok', component: Ok },
      { path: '/go', component: Home, redirect: '/\\evil.com' },
    ]
    const router = createRouter({ routes: withRedirect, url: '/' })
    await router.push('/go')
    expect(router.currentRoute().path).toBe('/')
  })
})

/**
 * `classifyHref` is the LINK-rendering sibling of `classifyRedirectTarget`, and
 * it carried the same `startsWith('//')` shape. The consequence is subtler than
 * the redirect one and strictly harder to notice: an `internal` verdict renders
 * a real `href` and leans on `<RouterLink>`'s click handler to route the value
 * through `sanitizePath` — but a ctrl-click, a middle-click or "open in new
 * tab" NEVER runs that handler. The browser resolves the raw href itself, so a
 * `to="/\evil.com"` that the redirect boundary now blocks would still have
 * navigated off-site through the one path the handler cannot see.
 *
 * `external` is the SAFE verdict here (plain anchor, full browser navigation) —
 * it is exactly what `//host` has always received, so this asserts the parser's
 * equivalence class gets one consistent answer rather than four.
 */
describe('classifyHref — authority delimiters', () => {
  const BASE = 'https://app.example.com/current'

  for (const to of ['//evil.com', '\\\\evil.com', '/\\evil.com', '\\/evil.com', '/\\/evil.com', '///evil.com']) {
    it(`${JSON.stringify(to)} is NOT internal (a middle-click would leave the origin)`, () => {
      // The oracle is the parser, not the verdict name: prove the browser would
      // in fact leave the origin, which is what makes `internal` unsafe.
      expect(new URL(to, BASE).origin, `${to} resolves off-origin`).not.toBe('https://app.example.com')
      expect(classifyHref(to)).toBe('external')
    })
  }

  for (const to of ['/ok', '/a/b?q=1#h', '/', '\\evil.com', '/a\\b']) {
    it(`${JSON.stringify(to)} stays internal (same-origin per the parser)`, () => {
      expect(new URL(to, BASE).origin).toBe('https://app.example.com')
      expect(classifyHref(to)).toBe('internal')
    })
  }

  it('the other kinds are untouched', () => {
    expect(classifyHref('#frag')).toBe('hash')
    expect(classifyHref('mailto:a@b.c')).toBe('protocol')
    expect(classifyHref('https://evil.com/x')).toBe('external')
    expect(classifyHref('')).toBe('internal')
  })
})

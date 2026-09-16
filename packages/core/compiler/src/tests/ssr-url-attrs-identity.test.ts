import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { EVENT_HANDLER_ATTRS, URL_ATTRS } from '@pyreon/core'
import { describe, expect, it } from 'vitest'

import { transformJSX } from '../index'
import { SSR_EVENT_HANDLER_ATTRS, SSR_URL_ATTRS } from '../jsx'

/**
 * The compiler cannot IMPORT core's `URL_ATTRS` at runtime — it is a build-time
 * tool with no `@pyreon/core` dependency, and taking one would invert the
 * layering (core is compiled BY this package). So the set is MIRRORED, in two
 * places: `jsx.ts` for the JS backend and `native/src/lib.rs` for the Rust one.
 *
 * A comment saying "kept in sync" is not a mechanism, and these copies proved
 * it. `xlink:href` was added to core's `URL_ATTRS` to close a named vector —
 * SVG's URL attribute, whose qualified name is not `href`, so
 * `<a xlink:href="javascript:…">` inside inline SVG is clickable in every
 * browser. Both compiler copies stayed at seven entries.
 *
 * The consequence was not a missed optimization. An attribute absent from this
 * set is classified GENERIC and routed to `_ssrAttrGen`, the lean SSR helper
 * whose own docblock says it skips the url-guard regex — so the compiled SSR
 * path (default-on whenever `@pyreon/runtime-server` resolves) emitted
 * `xlink:href="javascript:alert(1)"` verbatim, while the h() SSR path, the
 * client `applyAttrProp` path and the DOMParser sanitizer all blocked it. One
 * path of four shipped it, into the initial HTML, which the browser parses
 * before any of our code runs.
 *
 * So: identity, both directions, against the real source of truth.
 */
describe('SSR_URL_ATTRS is identity-locked to core URL_ATTRS', () => {
  it('the mirror is neither missing nor inventing an entry', () => {
    const mirror = [...SSR_URL_ATTRS].sort()
    const source = [...URL_ATTRS].sort()
    expect(
      mirror,
      'packages/core/compiler/src/jsx.ts:SSR_URL_ATTRS has drifted from ' +
        'packages/core/core/src/url-guard.ts:URL_ATTRS. An attribute missing ' +
        'here routes to _ssrAttrGen, which SKIPS the url-guard — a javascript: ' +
        'URL then reaches the SSR output. Mirror the Rust copy too ' +
        '(native/src/lib.rs:ssr_is_url_attr).',
    ).toEqual(source)
  })

  it('is not vacuously empty (guards the import above)', () => {
    expect(SSR_URL_ATTRS.size).toBeGreaterThan(5)
    expect(SSR_URL_ATTRS.has('xlink:href')).toBe(true)
  })

  // Behavioural, and backend-agnostic: `transformJSX` prefers the native
  // binary when one is built, so in CI this exercises the Rust mirror too.
  // A source-level assertion on the JS Set alone cannot see lib.rs.
  for (const attr of [...URL_ATTRS]) {
    it(`compiled SSR routes a dynamic ${attr} through the GUARDED helper`, () => {
      const tag = attr === 'xlink:href' ? 'a' : 'a'
      const src = `const v = "javascript:alert(1)"\nexport const C = () => <${tag} ${attr}={v}>x</${tag}>`
      const out = transformJSX(src, 'c.tsx', {
        ssr: true,
        ssrTemplate: true,
      } as never)
      const code = typeof out === 'string' ? out : (out as { code: string }).code
      const line = code.split('\n').find((l) => l.includes(attr)) ?? code
      // The lean generic helper is exactly the one that skips the guard.
      expect(
        line,
        `a dynamic ${attr} must NOT be emitted through _ssrAttrGen — that helper skips the url-guard`,
      ).not.toContain('_ssrAttrGen')
    })
  }
})

describe('SSR_EVENT_HANDLER_ATTRS is identity-locked to core EVENT_HANDLER_ATTRS', () => {
  it('the mirror is neither missing nor inventing an entry', () => {
    expect(
      [...SSR_EVENT_HANDLER_ATTRS].sort(),
      'packages/core/compiler/src/jsx.ts:SSR_EVENT_HANDLER_ATTRS has drifted from ' +
        'packages/core/core/src/url-guard.ts:EVENT_HANDLER_ATTRS. A lowercase handler ' +
        'missing here reaches _ssrAttrGen, which INVOKES a function value during SSR ' +
        'and bakes a string value as a live inline handler the h() path refuses. ' +
        'Mirror the Rust copy too (native/src/lib.rs:SSR_EVENT_HANDLER_ATTRS).',
    ).toEqual([...EVENT_HANDLER_ATTRS].sort())
  })
})

/**
 * The RUST mirror, locked the same way.
 *
 * The JS spec above says "Mirror the Rust copy too", and for a while that
 * sentence was the ONLY thing holding the native half: removing entries from
 * `native/src/lib.rs` alone left all 3,376 compiler specs green, because the
 * JS spec compares two JS constants and nothing read the Rust source. A drift
 * lock that covers one of two mirrors, while its message implies both, is the
 * shape this repo calls a dead gate — so the slice is parsed and compared.
 *
 * `ssr_is_lowercase_event_handler` does a `binary_search`, so SORT ORDER is
 * load-bearing: an out-of-order entry is not merely untidy, it makes the
 * lookup MISS and the attribute reaches `_ssrAttrGen`.
 */
describe('the Rust SSR_EVENT_HANDLER_ATTRS mirror', () => {
  const repoRoot = (): string => {
    let d = resolve(__dirname)
    while (!existsSync(join(d, '.git')) && dirname(d) !== d) d = dirname(d)
    return d
  }
  const rustAttrs = (): string[] => {
    const src = readFileSync(join(repoRoot(), 'packages/core/compiler/native/src/lib.rs'), 'utf8')
    const m = /const SSR_EVENT_HANDLER_ATTRS: &\[&str\] = &\[\n([\s\S]*?)\n\];/.exec(src)
    expect(m, 'the Rust SSR_EVENT_HANDLER_ATTRS slice was not found in native/src/lib.rs').not.toBeNull()
    return [...m![1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!)
  }

  it('carries exactly the same attributes as core', () => {
    expect(
      rustAttrs().slice().sort(),
      'native/src/lib.rs:SSR_EVENT_HANDLER_ATTRS has drifted from ' +
        'packages/core/core/src/url-guard.ts:EVENT_HANDLER_ATTRS. The native backend is the ' +
        'one transformJSX PREFERS, so a handler missing there is the shipped behaviour.',
    ).toEqual([...EVENT_HANDLER_ATTRS].sort())
  })

  it('is SORTED, because the lookup binary-searches it', () => {
    const attrs = rustAttrs()
    expect(attrs, 'ssr_is_lowercase_event_handler binary-searches this slice').toEqual(attrs.slice().sort())
  })
})

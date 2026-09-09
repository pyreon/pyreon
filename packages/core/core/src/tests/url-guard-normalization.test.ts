import { describe, expect, it } from 'vitest'

import { isUnsafeUrl } from '../url-guard'

/**
 * The URL parser strips ASCII tab/newline from ANYWHERE in the input and trims
 * leading C0-or-space before it resolves a scheme. So every case below is a
 * LIVE script URL in every browser, while `/^\s*(?:javascript|data):/i` — which
 * tolerates leading `\s*` only — read all of them as safe.
 *
 * The repo knew this in two other places and not in the guard itself:
 * `@pyreon/router`'s `redirect.ts` implements both WHATWG steps, and
 * `@pyreon/lint`'s `no-script-url` strips exactly this range with a comment
 * naming `java\tscript:` as the bypass. So the STATIC rule, which only ever
 * sees literals a developer typed, was strictly stronger than the RUNTIME
 * guard, which sees attacker-controlled values — backwards, and the reason
 * this is a value test rather than a shape test.
 *
 * Control characters are built with `String.fromCharCode` rather than written
 * as raw bytes, which would be invisible in review — the same reasoning the
 * lint rule states for escaping them in its own regex.
 */
const CH = (code: number): string => String.fromCharCode(code)
const TAB = CH(9)
const LF = CH(10)
const FF = CH(12)
const CR = CH(13)
const SOH = CH(1)
const NUL = CH(0)

describe('isUnsafeUrl normalizes the way the URL parser does', () => {
  const live: Array<[string, string]> = [
    ['plain', 'javascript:alert(1)'],
    ['embedded TAB', `java${TAB}script:alert(1)`],
    ['embedded LF', `java${LF}script:alert(1)`],
    ['embedded CR', `java${CR}script:alert(1)`],
    ['embedded FF', `java${FF}script:alert(1)`],
    ['many controls', `j${TAB}a${LF}v${CR}ascript:alert(1)`],
    ['leading C0 (0x01)', `${SOH}javascript:alert(1)`],
    ['leading NUL', `${NUL}javascript:alert(1)`],
    ['leading whitespace', '   javascript:alert(1)'],
    ['mixed case + TAB', `JaVa${TAB}ScRiPt:alert(1)`],
    ['data:, embedded', `da${TAB}ta:text/html;base64,PHNjcmlwdD4=`],
  ]
  for (const [label, url] of live) {
    it(`blocks ${label}`, () => {
      expect(isUnsafeUrl(url), JSON.stringify(url)).toBe(true)
    })
  }

  // The fast path must stay intact: it returns "safe" without running the
  // regex when the first char is printable ASCII and not j/J/d/D. That stays
  // sound under normalization — stripping only removes chars <= 32, so such a
  // first char is still the first one afterwards — but a regression here is a
  // silent per-attribute perf loss, so pin it behaviourally.
  const safe = [
    'https://example.com/a?b=1',
    '/relative/path',
    '#anchor',
    'mailto:a@b.c',
    './x',
    '',
    'not-a-scheme:whatever',
    'jolly-good://x',
    'documents/report.pdf',
  ]
  for (const url of safe) {
    it(`allows ${JSON.stringify(url)}`, () => {
      expect(isUnsafeUrl(url)).toBe(false)
    })
  }
})

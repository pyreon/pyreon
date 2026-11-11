/**
 * `atlas scan` / `atlas verify` human output, snapshotted at every colour
 * level (plain, 16 colours, 256 colours, truecolor), on a dark and a light background, and
 * with the ASCII symbol fallback. ESC is shown as `␛` so the escape codes read
 * in review.
 *
 * Built from the same pure pieces `runCli` prints: header, summary rows,
 * failure findings, a scan notice and the verdict.
 */
import { describe, expect, it } from 'vitest'
import { finding as verifyFinding } from '../../core/types'
import type { VerifyReport } from '../../verify/report'
import {
  commandHeader,
  failureLines,
  noticeLines,
  ratchetLines,
  summaryLines,
  termFor,
  type TermChoice,
  verdictLine,
} from '../render'

const ESC = String.fromCharCode(27)
const show = (s: string): string => s.split(ESC).join('␛')

const REPORT: VerifyReport = {
  scenarios: 22,
  verified: 12,
  failed: 2,
  unverified: 8,
  tallies: [
    { key: 'interaction', pass: 0, fail: 0, skip: 22, skipReason: 'not run — mounting is disabled for this run (`--no-mount`) — the scan stayed static' },
    { key: 'ssrParity', pass: 0, fail: 0, skip: 22, skipReason: 'not run — mounting is disabled for this run (`--no-mount`) — the scan stayed static' },
    { key: 'a11y', pass: 12, fail: 2, skip: 8 },
    { key: 'leak', pass: 0, fail: 0, skip: 22, skipReason: 'not run — mounting is disabled for this run (`--no-mount`) — the scan stayed static' },
    { key: 'reactivityCoverage', pass: 0, fail: 0, skip: 22, skipReason: 'browser-only — run `atlas verify-browser` to measure this (a Node scan cannot)' },
    { key: 'snapshot', pass: 0, fail: 0, skip: 22, skipReason: 'browser-only — run `atlas verify-browser` to measure this (a Node scan cannot)' },
  ],
  failures: [
    {
      id: 'button--empty',
      component: 'Button',
      checks: [
        {
          key: 'a11y',
          findings: [
            verifyFinding(
              'missing-accessible-name',
              'missing accessible name: "label" is empty',
              'Give "label" a non-empty value, or an aria-label if the text is genuinely decorative.',
            ),
          ],
        },
      ],
    },
    {
      id: 'badge--empty',
      component: 'Badge',
      checks: [{ key: 'a11y', findings: [verifyFinding('missing-accessible-name', 'missing accessible name: "label" is empty')] }],
    },
  ],
}

const render = (choice: TermChoice): string => {
  const t = termFor('stdout', choice)
  return [
    commandHeader(t, 'atlas scan', ['.', 'static (--no-mount)']),
    '',
    ...summaryLines(t, { components: 6, report: REPORT, wrote: ['atlas-catalog.json', 'atlas-agent-guide.md'] }),
    '',
    ...noticeLines(t, [
      'atlas: 1 file(s) export something PascalCase that produced no component:',
      '  1× a chained/member call — rocketstyle chains are found by the runtime pass (needs `theme` in your config); other member-call wrappers are not unwrapped',
      '    · src/components/Chip.tsx — Chip',
    ]),
    '',
    ...ratchetLines(
      t,
      'REGRESSED — 1 check(s) started failing, 2 check(s) stopped running',
      [
        '✗ button--empty — now failing: a11y',
        '✗ badge--default — no longer checked: interaction, leak (coverage lost — the failure did not go away, the check did)',
        '+ 1 new scenario(s)',
      ],
      true,
    ),
    '',
    ...failureLines(t, REPORT.failures, {
      limit: 1,
      sourceOf: (id) => (id === 'button--empty' ? 'src/components/Button.tsx' : undefined),
    }),
    '',
    verdictLine(t, { failed: 2, verified: 12, unverified: 8, components: 6, elapsedMs: 146 }),
  ].join('\n')
}

describe('atlas scan, themed', () => {
  const variants: Array<[string, TermChoice]> = [
    ['plain', { color: 0, unicode: true }],
    ['16 colours', { color: 1, theme: 'dark', unicode: true }],
    ['256 dark', { color: 2, theme: 'dark', unicode: true }],
    ['256 light', { color: 2, theme: 'light', unicode: true }],
    ['truecolor dark', { color: 3, theme: 'dark', unicode: true }],
    ['truecolor light', { color: 3, theme: 'light', unicode: true }],
    ['ascii', { color: 0, unicode: false }],
  ]
  for (const [name, choice] of variants) {
    it(name, () => {
      expect(show(render(choice))).toMatchSnapshot()
    })
  }
})

describe('the verdict', () => {
  const t = termFor('stdout', { color: 0, unicode: true })
  it('a clean run, a run that verified nothing, a load failure, a regression', () => {
    expect(verdictLine(t, { failed: 0, verified: 3, unverified: 0, components: 1, elapsedMs: 40 })).toBe(
      '✓ no failing scenarios · 3 verified · 0 unverified · 1 component · 40 ms',
    )
    // `scan` warns on a run that verified nothing; `verify` fails it.
    expect(verdictLine(t, { failed: 0, verified: 0, unverified: 2 })).toBe(
      '! nothing verified · 0 failing scenarios · 0 verified · 2 unverified',
    )
    expect(verdictLine(t, { failed: 0, verified: 0, unverified: 2, nothingVerifiedFails: true })).toBe(
      '✗ nothing verified · 0 failing scenarios · 0 verified · 2 unverified',
    )
    expect(verdictLine(t, { failed: 0, verified: 1, unverified: 0, failedToLoad: 2 })).toBe(
      '✗ 2 components could not be loaded · 0 failing scenarios · 1 verified · 0 unverified',
    )
    expect(verdictLine(t, { failed: 1, verified: 1, unverified: 0, regressed: true })).toBe(
      '✗ regressed against the committed catalog (--check) · 1 failing scenario · 1 verified · 0 unverified',
    )
  })
})

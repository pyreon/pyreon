/**
 * Refusing to mount when Atlas and the project hold different framework copies.
 *
 * ── Why refusing is the feature ───────────────────────────────────────────
 *
 * Mounting across two copies does not fail cleanly. It "works": components
 * compiled against one copy get mounted using another, and every check then
 * reports a verdict about the mismatch rather than about the component.
 *
 * Measured on a real 78-package workspace, that produced 2051 failing
 * scenarios, none of which were about the code. A catalog whose whole promise
 * is "a verdict you can trust" cannot ship that. `unverified` is already a
 * first-class state here — deliberately not a weak pass — so declining is both
 * honest and expressible.
 *
 * The condition is reachable in an ordinary way: Atlas ships in the framework's
 * fixed release group, so a normal install shares one copy, but upgrading Atlas
 * alone (or running a development build against an installed project) splits
 * them.
 */
import { describe, expect, it } from 'vitest'
import { formatDualInstanceNotice } from '../../cli/run'
import { dualInstanceDetail, isDualInstanceFailure } from '../load'

describe('isDualInstanceFailure', () => {
  it('recognises the sentinel message the framework actually throws', () => {
    // The real text, verbatim from `registerSingleton`'s error. Matching on a
    // paraphrase would pass here and miss in production.
    expect(isDualInstanceFailure('[Pyreon] Multiple instances of @pyreon/reactivity detected.')).toBe(
      true,
    )
    expect(isDualInstanceFailure('[Pyreon] Multiple instances of @pyreon/core detected.')).toBe(true)
    expect(
      isDualInstanceFailure('[Pyreon] Multiple instances of @pyreon/runtime-dom detected.'),
    ).toBe(true)
  })

  it('does NOT claim an ordinary load failure is a version split', () => {
    // A project with no DOM runtime at all is a headless catalog, not a broken
    // install, and telling its author to "align versions" would send them after
    // a problem they do not have.
    expect(isDualInstanceFailure("Failed to load url @pyreon/runtime-dom. Does the file exist?")).toBe(
      false,
    )
    expect(isDualInstanceFailure('Cannot find module @pyreon/core')).toBe(false)
    expect(isDualInstanceFailure('')).toBe(false)
  })

  it('is not fooled by a message that merely mentions instances', () => {
    expect(isDualInstanceFailure('Multiple instances of a component were mounted')).toBe(false)
  })
})

describe('dualInstanceDetail', () => {
  // The compact core `formatError` produces in BOTH dev and prod builds —
  // verbatim shape from @pyreon/reactivity's singleton-sentinel. The A/B lines
  // are the two resolved module locations; dropping them from the re-report is
  // the upstream-reported archaeology trip this extractor exists to prevent.
  const sentinelCore =
    `[Pyreon] Multiple instances of @pyreon/reactivity detected — this breaks reactivity/lifecycle/context contracts.\n` +
    `  A: file:///app/node_modules/@pyreon/reactivity/lib/index.js (v0.55.0)\n` +
    `  B: file:///app/node_modules/@pyreon/atlas/node_modules/@pyreon/reactivity/lib/index.js (v0.54.2)\n` +
    `Run 'pyreon doctor --check-dedup'. PYREON_SINGLE_INSTANCE=warn|silent overrides.`

  it('extracts the two resolved locations (+ versions) from the sentinel message', () => {
    expect(dualInstanceDetail(sentinelCore)).toBe(
      `A: file:///app/node_modules/@pyreon/reactivity/lib/index.js (v0.55.0)\n` +
        `B: file:///app/node_modules/@pyreon/atlas/node_modules/@pyreon/reactivity/lib/index.js (v0.54.2)`,
    )
  })

  it('still extracts when the dev remediation guide is appended after the core', () => {
    const dev = sentinelCore + `\n\nLikely causes:\n  1. Sub-dependency pinned an older version.`
    expect(dualInstanceDetail(dev)).toContain('A: file:///app/node_modules/@pyreon/reactivity')
    expect(dualInstanceDetail(dev)).toContain('(v0.54.2)')
  })

  it('returns undefined when the message shape carries no A/B lines', () => {
    // A future message-shape drift must degrade to the summary standing alone,
    // never to echoing an unparseable blob as "the two copies".
    expect(dualInstanceDetail('[Pyreon] Multiple instances of @pyreon/core detected.')).toBe(
      undefined,
    )
    expect(dualInstanceDetail('')).toBe(undefined)
  })

  it('the CLI notice carries both copies end-to-end from the caught message', () => {
    // The full chain the CLI runs: caught sentinel message → extraction →
    // printed notice. This is the assertion the upstream report is about — the
    // re-report must NAME the two resolved copies, not just say "align them".
    const notice = formatDualInstanceNotice(dualInstanceDetail(sentinelCore))
    expect(notice).toContain('The two copies:')
    expect(notice).toContain('A: file:///app/node_modules/@pyreon/reactivity/lib/index.js (v0.55.0)')
    expect(notice).toContain(
      'B: file:///app/node_modules/@pyreon/atlas/node_modules/@pyreon/reactivity/lib/index.js (v0.54.2)',
    )
    // Summary + remedy still present around the detail.
    expect(notice).toContain('DIFFERENT copies of the Pyreon framework')
    expect(notice).toContain('Align the versions')
  })

  it('the CLI notice degrades to the summary alone when no detail was extractable', () => {
    const notice = formatDualInstanceNotice(undefined)
    expect(notice).not.toContain('The two copies:')
    expect(notice).toContain('DIFFERENT copies of the Pyreon framework')
  })
})

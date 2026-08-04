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
import { isDualInstanceFailure } from '../load'

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

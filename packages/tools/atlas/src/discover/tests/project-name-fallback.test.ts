/**
 * `projectNameFor` names a sidebar heading. A package name that is ONLY a scope
 * (`@acme/`) or empty leaves nothing to title-case, and the heading must fall
 * back to the directory rather than render blank.
 */
import { describe, expect, it } from 'vitest'
import { projectNameFor } from '../workspace'

describe('projectNameFor', () => {
  it('falls back to the directory when the package name has no usable part', () => {
    expect(projectNameFor('@acme/', 'packages/design-core')).toBe(projectNameFor('design-core', 'x'))
    expect(projectNameFor('', 'packages/ui')).toBe(projectNameFor('ui', 'x'))
    expect(projectNameFor('@', 'libs/forms')).toBe(projectNameFor('forms', 'x'))
  })

  it('never returns an empty heading', () => {
    for (const name of ['@acme/', '', '@', '   ']) expect(projectNameFor(name, 'packages/core').length).toBeGreaterThan(0)
  })
})

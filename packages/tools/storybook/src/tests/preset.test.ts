import { describe, expect, it } from 'vitest'
import { addons, core, previewAnnotations } from '../preset'

// Coverage gap closed in PR #323. The Storybook preset module is loaded
// by Storybook's framework discovery at config-load time; its exports
// are read by Storybook itself and not by Pyreon code. Smoke-test the
// shape so a typo or accidental rename surfaces here.

describe('storybook preset module', () => {
  it('exports addons as an empty array (no addons preset by default)', () => {
    expect(Array.isArray(addons)).toBe(true)
    expect(addons).toHaveLength(0)
  })

  it('exports previewAnnotations with a single entry pointing at the preview module', () => {
    expect(Array.isArray(previewAnnotations)).toBe(true)
    expect(previewAnnotations).toHaveLength(1)
    expect(previewAnnotations[0]).toMatch(/preview$/)
  })

  it('exports core.renderer set to the @pyreon/storybook framework name', () => {
    expect(core).toEqual({ renderer: '@pyreon/storybook' })
  })
})

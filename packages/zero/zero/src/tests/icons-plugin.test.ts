import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
  componentNameFromSetKey,
  generateIconSetSource,
  generateNamedIconSetsSource,
  iconNameFromFile,
  iconsPlugin,
  scanIconDir,
} from '../icons-plugin'

// Pure-logic coverage for the iconsPlugin scanner + generator. The Vite
// plugin shell (fs write + dev watcher) is integration-tier (excluded from
// coverage, exercised by real example builds); these helpers are the
// load-bearing logic and are unit-tested directly.

describe('iconNameFromFile', () => {
  it('strips the .svg extension', () => {
    expect(iconNameFromFile('check.svg')).toBe('check')
  })

  it('kebab-cases camelCase + spaces + underscores, lowercases', () => {
    expect(iconNameFromFile('CheckCircle.svg')).toBe('check-circle')
    expect(iconNameFromFile('arrow_left.svg')).toBe('arrow-left')
    expect(iconNameFromFile('Chevron Down.svg')).toBe('chevron-down')
  })

  it('leaves an already-kebab name unchanged', () => {
    expect(iconNameFromFile('arrow-up-right.svg')).toBe('arrow-up-right')
  })
})

describe('scanIconDir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-icons-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('returns empty for a missing directory', () => {
    expect(scanIconDir(join(dir, 'nope'))).toEqual([])
  })

  it('lists only *.svg, sorted, ignoring other files', () => {
    writeFileSync(join(dir, 'b.svg'), '<svg/>')
    writeFileSync(join(dir, 'a.svg'), '<svg/>')
    writeFileSync(join(dir, 'readme.md'), 'x')
    writeFileSync(join(dir, 'c.SVG'), '<svg/>')
    expect(scanIconDir(dir)).toEqual(['a.svg', 'b.svg', 'c.SVG'])
  })
})

describe('generateIconSetSource', () => {
  it('inline mode: ?raw imports + createNamedIcon(REGISTRY)', () => {
    const src = generateIconSetSource(['check-circle.svg', 'arrow-left.svg'], {
      mode: 'inline',
      importDir: './icons',
    })
    expect(src).toContain("import { createNamedIcon } from '@pyreon/zero'")
    expect(src).toContain("import checkCircle from './icons/check-circle.svg?raw'")
    expect(src).toContain("import arrowLeft from './icons/arrow-left.svg?raw'")
    expect(src).toContain('"check-circle": checkCircle,')
    expect(src).toContain('export type IconName = keyof typeof REGISTRY')
    expect(src).toContain('export const Icon = createNamedIcon(REGISTRY)')
    // inline mode does NOT pass the image option
    expect(src).not.toContain("{ mode: 'image' }")
  })

  it('image mode: URL imports (no ?raw) + image option', () => {
    const src = generateIconSetSource(['logo.svg'], {
      mode: 'image',
      importDir: './brand',
    })
    expect(src).toContain("import logo from './brand/logo.svg'")
    expect(src).not.toContain('?raw')
    expect(src).toContain("export const Icon = createNamedIcon(REGISTRY, { mode: 'image' })")
  })

  it('collision-guards camelCase bindings that map to the same identifier', () => {
    const src = generateIconSetSource(['foo-bar.svg', 'foo_bar.svg'], {
      mode: 'inline',
      importDir: './i',
    })
    // both kebab to "foo-bar" key but get distinct bindings (one suffixed `_`)
    expect(src).toContain('import fooBar from')
    expect(src).toContain('import fooBar_ from')
  })

  it('emits the vite/client triple-slash reference for ?raw typing', () => {
    const src = generateIconSetSource(['x.svg'], {
      mode: 'inline',
      importDir: './i',
    })
    expect(src).toContain('/// <reference types="vite/client" />')
  })

  it('handles an empty set (IconName = keyof {} ⇒ never)', () => {
    const src = generateIconSetSource([], { mode: 'inline', importDir: './i' })
    expect(src).toContain('const REGISTRY = {')
    expect(src).toContain('export const Icon = createNamedIcon(REGISTRY)')
  })
})

describe('componentNameFromSetKey', () => {
  it('PascalCases the key + appends Icon', () => {
    expect(componentNameFromSetKey('ui')).toBe('UiIcon')
    expect(componentNameFromSetKey('brand')).toBe('BrandIcon')
    expect(componentNameFromSetKey('brand-marks')).toBe('BrandMarksIcon')
    expect(componentNameFromSetKey('social_logos')).toBe('SocialLogosIcon')
  })

  it('sanitizes a non-identifier-leading key', () => {
    expect(componentNameFromSetKey('1up')).toBe('Set1upIcon')
  })
})

describe('generateNamedIconSetsSource', () => {
  it('emits a namespaced component + type PER set, one createNamedIcon import', () => {
    const src = generateNamedIconSetsSource([
      {
        key: 'ui',
        files: ['check.svg', 'arrow-left.svg'],
        mode: 'inline',
        importDir: './icons/ui',
      },
      { key: 'brand', files: ['logo.svg'], mode: 'image', importDir: './icons/brand' },
    ])
    // one shared import
    expect(src.match(/import \{ createNamedIcon \}/g)).toHaveLength(1)
    // ui set — inline (?raw), typed UiIconName, <UiIcon>
    expect(src).toContain("import ui_check from './icons/ui/check.svg?raw'")
    expect(src).toContain('export type UiIconName = keyof typeof UiIcon_REGISTRY')
    expect(src).toContain('export const UiIcon = createNamedIcon(UiIcon_REGISTRY)')
    // brand set — image (no ?raw), typed BrandIconName, <BrandIcon> image-mode
    expect(src).toContain("import brand_logo from './icons/brand/logo.svg'")
    expect(src).toContain('export type BrandIconName = keyof typeof BrandIcon_REGISTRY')
    expect(src).toContain(
      "export const BrandIcon = createNamedIcon(BrandIcon_REGISTRY, { mode: 'image' })",
    )
    // NO bare `Icon` / `IconName` — sets never clash with the single-set names
    expect(src).not.toContain('export const Icon =')
    expect(src).not.toContain('export type IconName =')
  })

  it('per-set binding prefix → two sets sharing a glyph filename do not collide', () => {
    const src = generateNamedIconSetsSource([
      { key: 'a', files: ['star.svg'], mode: 'inline', importDir: './a' },
      { key: 'b', files: ['star.svg'], mode: 'inline', importDir: './b' },
    ])
    expect(src).toContain("import a_star from './a/star.svg?raw'")
    expect(src).toContain("import b_star from './b/star.svg?raw'")
  })
})

describe('iconsPlugin — dir/sets XOR validation', () => {
  it('throws when neither dir nor sets is given', () => {
    expect(() => iconsPlugin({} as never)).toThrow(/EXACTLY ONE/)
  })

  it('throws when BOTH dir and sets are given', () => {
    expect(() => iconsPlugin({ dir: './icons', sets: { ui: { dir: './ui' } } } as never)).toThrow(
      /EXACTLY ONE/,
    )
  })

  it('accepts the single-set form', () => {
    const p = iconsPlugin({ dir: './icons' })
    expect(p.name).toBe('pyreon:zero-icons')
  })

  it('accepts the named multi-set form', () => {
    const p = iconsPlugin({ sets: { ui: { dir: './icons/ui' } } })
    expect(p.name).toBe('pyreon:zero-icons')
  })
})

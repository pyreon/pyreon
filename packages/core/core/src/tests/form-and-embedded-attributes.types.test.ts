/**
 * Compile-time type tests for element-specific HTML attributes that used to
 * fall through to the bare `PyreonHTMLAttributes` (#4823: `<fieldset disabled>`
 * and `<optgroup label disabled>` were type errors although the runtime set
 * them). The issue's own JSX repro lives in
 * `form-and-embedded-attributes.types-fixture.tsx`; `tsc --noEmit` is the check
 * for both files, so a missing attribute fails `typecheck`.
 */
import { describe, expectTypeOf, it } from 'vitest'
import type {} from '../jsx-runtime'

type El = JSX.IntrinsicElements

describe('form-associated element attributes (#4823)', () => {
  it('<fieldset> accepts disabled (value or accessor), form, name', () => {
    expectTypeOf<boolean>().toMatchTypeOf<El['fieldset']['disabled']>()
    expectTypeOf<() => boolean>().toMatchTypeOf<El['fieldset']['disabled']>()
    expectTypeOf<El['fieldset']>().toHaveProperty('form')
    expectTypeOf<El['fieldset']>().toHaveProperty('name')
  })

  it('<optgroup> accepts label and disabled', () => {
    expectTypeOf<() => boolean>().toMatchTypeOf<El['optgroup']['disabled']>()
    expectTypeOf<El['optgroup']>().toHaveProperty('label')
  })

  it('<output> accepts for, form, name', () => {
    expectTypeOf<El['output']>().toHaveProperty('for')
    expectTypeOf<El['output']>().toHaveProperty('form')
    expectTypeOf<El['output']>().toHaveProperty('name')
  })

  it('form-submission overrides on <input>, autocomplete on <select>/<textarea>', () => {
    expectTypeOf<El['input']>().toHaveProperty('formAction')
    expectTypeOf<El['input']>().toHaveProperty('formMethod')
    expectTypeOf<El['input']>().toHaveProperty('dirName')
    expectTypeOf<El['select']>().toHaveProperty('autoComplete')
    expectTypeOf<El['textarea']>().toHaveProperty('autoComplete')
    expectTypeOf<El['button']>().toHaveProperty('commandFor')
    expectTypeOf<El['object']>().toHaveProperty('form')
  })
})

describe('other element-specific attributes (intrinsic-table audit)', () => {
  it('document metadata', () => {
    expectTypeOf<El['base']>().toHaveProperty('href')
    expectTypeOf<El['style']>().toHaveProperty('media')
    expectTypeOf<El['meta']>().toHaveProperty('media')
    expectTypeOf<El['link']>().toHaveProperty('sizes')
    expectTypeOf<El['link']>().toHaveProperty('imageSrcSet')
    expectTypeOf<El['script']>().toHaveProperty('fetchPriority')
  })

  it('lists, tables, image maps', () => {
    expectTypeOf<El['li']>().toHaveProperty('value')
    expectTypeOf<El['colgroup']>().toHaveProperty('span')
    expectTypeOf<El['img']>().toHaveProperty('useMap')
    expectTypeOf<El['map']>().toHaveProperty('name')
    expectTypeOf<El['area']>().toHaveProperty('coords')
    expectTypeOf<El['area']>().toHaveProperty('shape')
  })

  it('embedded content', () => {
    expectTypeOf<El['track']>().toHaveProperty('srclang')
    expectTypeOf<El['track']>().toHaveProperty('kind')
    expectTypeOf<El['source']>().toHaveProperty('width')
    expectTypeOf<El['embed']>().toHaveProperty('src')
    expectTypeOf<El['object']>().toHaveProperty('data')
    expectTypeOf<El['param']>().toHaveProperty('value')
  })

  it('interactive and scripting', () => {
    expectTypeOf<El['details']>().toHaveProperty('name')
    expectTypeOf<El['dialog']>().toHaveProperty('closedBy')
    expectTypeOf<El['slot']>().toHaveProperty('name')
    expectTypeOf<El['template']>().toHaveProperty('shadowRootMode')
  })

  it('global attributes', () => {
    expectTypeOf<El['div']>().toHaveProperty('accessKey')
    expectTypeOf<El['div']>().toHaveProperty('autoFocus')
    expectTypeOf<El['script']>().toHaveProperty('nonce')
    expectTypeOf<El['div']>().toHaveProperty('itemProp')
  })
})

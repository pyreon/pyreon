/**
 * Compile-time type tests for the SVG attribute + intrinsic-element surface
 * (downstream report, 2026-07).
 *
 * Regressions locked here:
 *   - `SvgAttributes` had `maskUnits`/`maskContentUnits` (the attributes OF a
 *     `<mask>`) but not `mask` (the reference TO one), plus no `filter`,
 *     opacity/dash presentation, or filter-primitive attributes.
 *   - `JSX.IntrinsicElements` lacked `<image>` and every SVG filter element,
 *     so they fell through to the `PyreonHTMLAttributes` catch-all and lost
 *     their SVG typing (`<image href>` errored).
 *
 * Downstream augmentation of SVG attributes IS supported via `declare module
 * '@pyreon/core' { interface SvgAttributes { … } }` (see the JSDoc on
 * `SvgAttributes`). That merge cannot be exercised from inside the declaring
 * module, so it's covered by the JSDoc example + the docs `@check` block;
 * this file locks the shipped attribute/element surface.
 */
import { describe, expectTypeOf, it } from 'vitest'
import type { SvgAttributes } from '../jsx-runtime'

describe('SvgAttributes — reference + presentation attributes', () => {
  it('has `mask` (the reference), not only `maskUnits`', () => {
    expectTypeOf<SvgAttributes>().toHaveProperty('mask')
    expectTypeOf<SvgAttributes['mask']>().toEqualTypeOf<string | undefined>()
  })

  it('has `filter` and common presentation attributes', () => {
    expectTypeOf<SvgAttributes>().toHaveProperty('filter')
    expectTypeOf<SvgAttributes>().toHaveProperty('fill-opacity')
    expectTypeOf<SvgAttributes>().toHaveProperty('stroke-opacity')
    expectTypeOf<SvgAttributes>().toHaveProperty('stroke-dasharray')
    expectTypeOf<SvgAttributes>().toHaveProperty('stroke-dashoffset')
    expectTypeOf<SvgAttributes>().toHaveProperty('paint-order')
    expectTypeOf<SvgAttributes>().toHaveProperty('vector-effect')
  })

  it('has filter-primitive attributes and the xlink:href legacy form', () => {
    expectTypeOf<SvgAttributes>().toHaveProperty('in')
    expectTypeOf<SvgAttributes>().toHaveProperty('stdDeviation')
    expectTypeOf<SvgAttributes>().toHaveProperty('flood-color')
    expectTypeOf<SvgAttributes>().toHaveProperty('xlink:href')
  })
})

describe('JSX.IntrinsicElements — SVG elements are typed as SvgAttributes', () => {
  it('has <image> with an href', () => {
    expectTypeOf<JSX.IntrinsicElements>().toHaveProperty('image')
    expectTypeOf<JSX.IntrinsicElements['image']>().toHaveProperty('href')
  })

  it('has the filter element and its primitives', () => {
    expectTypeOf<JSX.IntrinsicElements>().toHaveProperty('filter')
    expectTypeOf<JSX.IntrinsicElements>().toHaveProperty('feGaussianBlur')
    expectTypeOf<JSX.IntrinsicElements>().toHaveProperty('feColorMatrix')
    expectTypeOf<JSX.IntrinsicElements>().toHaveProperty('feMerge')
  })

  it('still exposes the pre-existing SVG elements', () => {
    expectTypeOf<JSX.IntrinsicElements>().toHaveProperty('svg')
    expectTypeOf<JSX.IntrinsicElements>().toHaveProperty('path')
    expectTypeOf<JSX.IntrinsicElements>().toHaveProperty('mask')
    expectTypeOf<JSX.IntrinsicElements>().toHaveProperty('clipPath')
  })
})

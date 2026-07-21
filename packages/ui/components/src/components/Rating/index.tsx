/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h, splitProps } from '@pyreon/core'
import { RatingBase, type RatingBaseProps, type RatingState } from '@pyreon/ui-primitives'
import { el } from '../../factory'

/**
 * ELEMENT-FIRST COMPOSITION (the 2026-07-21 architecture decision, piloted
 * here): the styled layer renders its OWN internal markup out of Element
 * atoms wired to the headless base's props-getters — layout comes from
 * Element PROPS (direction/alignY/gap), visual style from rocketstyle
 * themes, and there is ZERO hand-written `display` CSS anywhere below.
 * The consumer render-prop remains as the escape hatch.
 */

/** The rating row — layout is pure Element props (no display CSS). */
const RatingRoot = el
  .config({ name: 'Rating' })
  // Element dual-axis semantics: on a SIMPLE (slot-less) element the
  // children's layout is the CONTENT axis — contentDirection/contentAlignX/
  // contentAlignY (plain direction/alignX/alignY are the before/content/after
  // SLOT axis and only apply on compound elements). Using the content props
  // here is the correct Element-first form; zero display CSS.
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center',
    gap: 1,
  })
  .theme((t) => ({
    fontSize: t.fontSize.large,
    cursor: 'pointer',
  }))

/**
 * One star glyph. Fill is STATIC CSS keyed on the base's accessor'd
 * `data-filled` attribute (hover preview wins over the committed value) —
 * the attribute flips via a renderEffect, the class never changes.
 */
const RatingStar = el
  .config({ name: 'RatingStar' })
  .attrs({ tag: 'span' })
  .theme((t) => ({
    color: t.color.system.base[300],
    transition: t.transition.fast,
    extendCss: `
      &[data-filled='true'] { color: ${t.color.system.warning.base}; }
    `,
  }))

export interface RatingProps extends RatingBaseProps {
  /** Consumer render-prop ESCAPE HATCH — overrides the built-in markup. */
  children?: (state: RatingState) => VNodeChild
}

/**
 * Star rating — batteries-included: renders its own accessible star row
 * (`<Rating defaultValue={3} />` just works). Behavior/ARIA from RatingBase
 * (radiogroup pattern, value-adjust arrows, one tab stop, hover preview,
 * localizable labels); structure from Element; visuals from the theme.
 */
export const Rating: ComponentFn<RatingProps> = (props) => {
  const [own, rest] = splitProps(props, ['children'])

  // Escape hatch: a consumer render-prop replaces the built-in markup.
  if (typeof own.children === 'function') {
    return h(RatingBase as never, { ...rest, children: own.children }) as unknown as VNodeChild
  }

  return h(RatingBase as never, {
    ...rest,
    children: (s: RatingState) =>
      h(
        RatingRoot as never,
        s.rootProps(),
        // Static star render — the base's accessor props (aria-checked,
        // tabIndex, data-filled) stay live through the spread; re-rendering
        // the list would destroy DOM focus (the roving-tabindex rule).
        ...Array.from({ length: s.max }, (_, i) =>
          h(RatingStar as never, s.getStarProps(i + 1), '★'),
        ),
      ),
  }) as unknown as VNodeChild
}

export default Rating

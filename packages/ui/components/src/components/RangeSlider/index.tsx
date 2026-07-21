/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h, splitProps } from '@pyreon/core'
import {
  RangeSliderBase,
  type RangeSliderBaseProps,
  type RangeSliderState,
} from '@pyreon/ui-primitives'
import { el } from '../../factory'

/**
 * ELEMENT-FIRST COMPOSITION (rollout #3): batteries-included dual-thumb
 * slider — `<RangeSlider defaultValue={[20, 80]} />` renders an operable,
 * announced, localizable widget out of the box:
 *
 * - A11Y: both thumbs are `role="slider"` with accessor-live
 *   valuenow/valuetext and cross-constrained min/max (APG multi-thumb) —
 *   wired straight from RangeSliderBase's thumbProps.
 * - HOTKEYS: per-thumb arrows ±step, PageUp/Down ±largeStep, Home/End —
 *   the base's onKeyDown ships wired on each thumb.
 * - I18N: `labels` prop (start/end aria-labels + valuetext formatters)
 *   flows through untouched.
 *
 * Layout: Element content-axis props on the root; thumb/fill positioning is
 * per-instance dynamic (percentages from the live value) so it rides inline
 * STYLE ACCESSORS (the RingProgress precedent) — no hand-written `display`.
 */

const RangeRoot = el
  .config({ name: 'RangeSlider' })
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center',
    block: true,
  })
  .theme(() => ({
    position: 'relative',
    minHeight: 24,
  }))

const RangeTrack = el
  .config({ name: 'RangeTrack' })
  .attrs({ tag: 'div', block: true })
  .theme((t) => ({
    position: 'relative',
    height: 4,
    borderRadius: t.borderRadius.pill,
    backgroundColor: t.color.system.base[200],
    cursor: 'pointer',
  }))

const RangeThumb = el
  .config({ name: 'RangeThumb' })
  .attrs({ tag: 'span' })
  .theme((t) => ({
    position: 'absolute',
    top: '50%',
    width: 16,
    height: 16,
    borderRadius: t.borderRadius.pill,
    backgroundColor: t.color.system.light.base,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: t.color.system.primary.base,
    cursor: 'pointer',
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[100]}`,
      outline: 'none',
    },
  }))

export interface RangeSliderProps extends RangeSliderBaseProps {
  /** Consumer render-prop ESCAPE HATCH — overrides the built-in markup. */
  children?: (state: RangeSliderState) => VNodeChild
}

export const RangeSlider: ComponentFn<RangeSliderProps> = (props) => {
  const [own, rest] = splitProps(props, ['children'])

  if (typeof own.children === 'function') {
    return h(RangeSliderBase as never, { ...rest, children: own.children }) as unknown as VNodeChild
  }

  return h(RangeSliderBase as never, {
    ...rest,
    children: (s: RangeSliderState) => {
      const pct = (v: number) => ((v - s.min) / (s.max - s.min)) * 100
      return h(
        RangeRoot as never,
        s.rootProps(),
        h(
          RangeTrack as never,
          s.trackProps(),
          // Fill bar between the thumbs — per-instance dynamic, style ACCESSOR
          // (renderEffect-wrapped → live on value change).
          h('span', {
            'data-range-fill': 'true',
            'aria-hidden': 'true',
            style: () => {
              const [lo, hi] = s.value()
              return `position:absolute;top:0;height:100%;border-radius:inherit;background:currentColor;left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%`
            },
          }),
          h(RangeThumb as never, {
            ...s.startThumbProps(),
            style: () => `left:${pct(s.value()[0])}%;transform:translate(-50%,-50%)`,
          }),
          h(RangeThumb as never, {
            ...s.endThumbProps(),
            style: () => `left:${pct(s.value()[1])}%;transform:translate(-50%,-50%)`,
          }),
        ),
      )
    },
  }) as unknown as VNodeChild
}

export default RangeSlider

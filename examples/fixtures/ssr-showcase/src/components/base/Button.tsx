/**
 * Button — interactive element with hover/focus/active states. Tests the
 * full pseudo-state pipeline: base theme + hover theme + focus theme +
 * active theme all going through `makeItResponsive`.
 */

import { element } from '../core'

export default element
  .config({ name: 'base/Button' })
  .attrs<{ onClick?: () => void }>({
    tag: 'button',
    alignX: 'center',
    alignY: 'center',
  })
  .theme((t) => ({
    paddingX: t.space.large,
    paddingY: t.space.medium,
    fontSize: t.fontSize.base,
    fontFamily: t.fontFamily.base,
    fontWeight: 500,
    borderWidth: 0,
    borderRadius: t.borderRadius.base,
    background: t.color.primary.base,
    color: t.color.light.base,
    transition: t.transition.base,
    hover: {
      background: t.color.primary.alt,
    },
    focus: {
      outlineWidth: 2,
      outlineStyle: 'solid',
      outlineColor: t.color.primary.alt,
      outlineOffset: 2,
    },
    active: {
      transform: 'translateY(1px)',
    },
  }))

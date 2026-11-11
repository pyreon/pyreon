import { disabledState, el, focusRing, focusRingTone, solidFill, tintText } from '../../factory'

const ActionIcon = el
  .config({ name: 'ActionIcon' })
  .attrs({ tag: 'button', type: 'button', direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'center',
    contentAlignY: 'center', alignX: 'center', alignY: 'center' })
  .theme((t) => ({
    cursor: 'pointer',
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.transparent,
    borderRadius: t.borderRadius.base,
    transition: t.transition.fast,
    hover: {
      transform: 'scale(1.05)',
    },
    focus: focusRing(t),
    active: {
      transform: 'scale(0.95)',
    },
    disabled: { ...disabledState(), pointerEvents: 'none' },
  }))
  .states((t) => ({
    primary: solidFill(t, 'primary'),
    secondary: {
      backgroundColor: t.color.system.base[100],
      color: t.color.system.base[700],
      hover: {
        backgroundColor: t.color.system.base[200],
      },
    },
    danger: {
      ...solidFill(t, 'error'),
      focus: focusRingTone(t, 'error'),
    },
  }))
  .sizes((t) => ({
    xSmall: { width: '24px', height: '24px', fontSize: t.fontSize.xSmall },
    small: { width: '30px', height: '30px', fontSize: t.fontSize.small },
    medium: { width: '36px', height: '36px', fontSize: t.fontSize.base },
    large: { width: '42px', height: '42px', fontSize: t.fontSize.medium },
    xLarge: { width: '48px', height: '48px', fontSize: t.fontSize.large },
  }))
  .variants((t, m) => ({
    filled: {},
    outline: {
      backgroundColor: t.color.system.transparent,
      borderColor: t.color.system.primary.base,
      color: tintText(t, m, 'primary'),
      hover: {
        backgroundColor: t.color.system.primary[50],
      },
    },
    subtle: {
      backgroundColor: t.color.system.primary[50],
      color: tintText(t, m, 'primary'),
      hover: {
        backgroundColor: t.color.system.primary[100],
      },
    },
    transparent: {
      backgroundColor: t.color.system.transparent,
      color: t.color.system.base[500],
      hover: {
        backgroundColor: t.color.system.base[100],

        color: t.color.system.dark.base,
      },
    },
  }))

export default ActionIcon

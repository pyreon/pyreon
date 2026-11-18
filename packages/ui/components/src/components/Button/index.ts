import { disabledState, el, focusRing, neutralToneKeys, solidFill, toneKeys, toneVariant } from '../../factory'

const Button = el
  .config({ name: 'Button' })
  .attrs({ tag: 'button', type: 'button', direction: 'inline', contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center', alignX: 'center', alignY: 'center', gap: 8 })
  .theme((t, m) => ({
    // The tone a variant draws in when no state is set.
    ...toneKeys(t, m, 'primary'),
    fontSize: t.fontSize.base,
    fontWeight: t.fontWeight.medium,
    lineHeight: t.lineHeight.base,
    borderRadius: t.borderRadius.base,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.transparent,
    cursor: 'pointer',
    transition: t.transition.base,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    focus: focusRing(t),
    disabled: { ...disabledState(), pointerEvents: 'none' },
    active: {
      transform: 'scale(0.98)',
    },
  }))
  .states((t, m) => ({
    primary: { ...solidFill(t, 'primary'), ...toneKeys(t, m, 'primary') },
    secondary: {
      ...neutralToneKeys(t, m),
      backgroundColor: t.color.system.base[100],
      color: t.color.system.dark[800],
      hover: {
        backgroundColor: t.color.system.base[200],
      },
    },
    danger: { ...solidFill(t, 'error'), ...toneKeys(t, m, 'error') },
    success: { ...solidFill(t, 'success'), ...toneKeys(t, m, 'success') },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xSmall,
      paddingBottom: t.spacing.xSmall,
      paddingLeft: t.spacing.medium,
      paddingRight: t.spacing.medium,
    },
    medium: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.small,
      paddingBottom: t.spacing.small,
      paddingLeft: t.spacing.large,
      paddingRight: t.spacing.large,
    },
    large: {
      fontSize: t.fontSize.medium,
      paddingTop: t.spacing.medium,
      paddingBottom: t.spacing.medium,
      paddingLeft: t.spacing.xLarge,
      paddingRight: t.spacing.xLarge,
    },
  }))
  // Each variant is drawn in the active state's tone (`toneKeys`), so
  // `state="danger" variant="outline"` is a red outline, not a blue one.
  .variants((t) => ({
    solid: {},
    outline: toneVariant((tone) => ({
      backgroundColor: t.color.system.transparent,
      borderColor: tone.toneFill,
      color: tone.toneText,
      hover: {
        backgroundColor: tone.toneTint50,
      },
    })),
    subtle: toneVariant((tone) => ({
      backgroundColor: tone.toneTint100,
      color: tone.toneText,
      hover: {
        backgroundColor: tone.toneTint200,
      },
    })),
    ghost: toneVariant((tone) => ({
      backgroundColor: t.color.system.transparent,
      color: tone.toneText,
      hover: {
        backgroundColor: t.color.system.base[50],
      },
    })),
    link: toneVariant((tone) => ({
      backgroundColor: t.color.system.transparent,
      color: tone.toneText,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      textDecoration: 'underline',
      // A link has no fill, hovered or not — without this the state's solid
      // hover fill showed behind the tone-coloured text (2.5:1 or worse).
      hover: {
        backgroundColor: t.color.system.transparent,
      },
    })),
  }))

export default Button

export const IconButton = el
  .config({ name: 'IconButton' })
  .attrs({ tag: 'button', type: 'button', direction: 'inline', contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center', alignX: 'center', alignY: 'center' })
  .theme((t) => ({
    backgroundColor: t.color.system.transparent,
    color: t.color.system.base[600],
    borderRadius: t.borderRadius.base,
    borderWidth: 0,
    cursor: 'pointer',
    transition: t.transition.base,
    padding: t.spacing.small,
    hover: {
      backgroundColor: t.color.system.base[50],

      color: t.color.system.dark.base,
    },
    focus: focusRing(t),
    disabled: disabledState(),
  }))
  .sizes((t) => ({
    small: { padding: t.spacing.xSmall },
    medium: { padding: t.spacing.small },
    large: { padding: t.spacing.medium },
  }))

export const CloseButton = el
  .config({ name: 'CloseButton' })
  .attrs({ tag: 'button', type: 'button', 'aria-label': 'Close', direction: 'inline', contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center', alignX: 'center', alignY: 'center' })
  .theme((t) => ({
    backgroundColor: t.color.system.transparent,
    color: t.color.system.base[400],
    borderRadius: t.borderRadius.small,
    borderWidth: 0,
    cursor: 'pointer',
    transition: t.transition.fast,
    padding: t.spacing.xxSmall,
    hover: {
      backgroundColor: t.color.system.base[50],

      color: t.color.system.dark[700],
    },
    focus: focusRing(t),
    disabled: disabledState(),
  }))
  .sizes((t) => ({
    small: { padding: t.spacing.xxxSmall },
    medium: { padding: t.spacing.xxSmall },
    large: { padding: t.spacing.xSmall },
  }))

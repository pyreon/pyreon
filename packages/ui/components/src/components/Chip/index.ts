import { disabledState, el, focusRing, tones, toneText } from '../../factory'

const Chip = el
  .config({ name: 'Chip' })
  .attrs({ tag: 'div', direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center', alignY: 'center', gap: 1 })
  .theme((t, m) => ({
    fontWeight: t.fontWeight.medium,
    // Sets its own text tone: a state paints the chip's surface, so inheriting
    // the page's text colour would put dark text on a dark chip (and back).
    color: tones(t, m).text,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: t.transition.fast,
    userSelect: 'none',
    focus: focusRing(t),
    disabled: { ...disabledState(), pointerEvents: 'none' },
  }))
  .states((t, m) => ({
    primary: {
      backgroundColor: t.color.system.primary[100],
      color: toneText(t, m, 'primary'),
      hover: {
        backgroundColor: t.color.system.primary[200],
      },
    },
    secondary: {
      backgroundColor: t.color.system.base[100],
      color: tones(t, m).textMuted,
      hover: {
        backgroundColor: t.color.system.base[200],
      },
    },
    success: {
      backgroundColor: t.color.system.success[100],
      color: toneText(t, m, 'success'),
      hover: {
        backgroundColor: t.color.system.success[200],
      },
    },
    error: {
      backgroundColor: t.color.system.error[100],
      color: toneText(t, m, 'error'),
      hover: {
        backgroundColor: t.color.system.error[200],
      },
    },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
      paddingLeft: t.spacing.xxSmall,
      paddingRight: t.spacing.xxSmall,
      borderRadius: t.borderRadius.small,
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.base,
    },
    large: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
      borderRadius: t.borderRadius.medium,
    },
  }))
  .variants(() => ({
    filled: {},
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: 'currentColor',
    },
  }))

export default Chip

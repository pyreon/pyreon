import { txt } from '../../factory'

const Badge = txt
  .config({ name: 'Badge' })
  .attrs({ tag: 'span' })
  .theme((t) => ({
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: t.fontSize.small,
    fontWeight: t.fontWeight.medium,
    lineHeight: t.lineHeight.small,
    borderRadius: t.borderRadius.pill,
    whiteSpace: 'nowrap',
    paddingLeft: t.spacing.xSmall,
    paddingRight: t.spacing.xSmall,
    paddingTop: t.spacing.xxxSmall,
    paddingBottom: t.spacing.xxxSmall,
  }))
  .states((t) => ({
    primary: {
      backgroundColor: t.color.system.primary[100],
      color: t.color.system.primary[800],
    },
    secondary: {
      backgroundColor: t.color.system.base[100],
      color: t.color.system.base[800],
    },
    success: {
      backgroundColor: t.color.system.success[100],
      color: t.color.system.success[800],
    },
    error: {
      backgroundColor: t.color.system.error[100],
      color: t.color.system.error[800],
    },
    warning: {
      backgroundColor: t.color.system.warning[100],
      color: t.color.system.warning[800],
    },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingLeft: t.spacing.xxSmall,
      paddingRight: t.spacing.xxSmall,
      paddingTop: 0,
      paddingBottom: 0,
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
    },
    large: {
      fontSize: t.fontSize.base,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
    },
  }))
  .variants(() => ({
    solid: {},
    outline: {
      backgroundColor: 'transparent',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'currentColor',
    },
    subtle: {
      opacity: 0.8,
    },
  }))

export default Badge

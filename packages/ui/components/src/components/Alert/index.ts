import { el } from '../../factory'

const Alert = el
  .config({ name: 'Alert' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center', block: true })
  .theme((t) => ({
    display: 'flex',
    alignItems: 'flex-start',
    padding: t.spacing.small,
    borderRadius: t.borderRadius.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
  }))
  .states((t) => ({
    info: {
      backgroundColor: t.color.system.info[50],
      color: t.color.system.info[800],
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: t.color.system.info.base,
    },
    success: {
      backgroundColor: t.color.system.success[50],
      color: t.color.system.success[800],
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: t.color.system.success.base,
    },
    warning: {
      backgroundColor: t.color.system.warning[50],
      color: t.color.system.warning[800],
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: t.color.system.warning.base,
    },
    error: {
      backgroundColor: t.color.system.error[50],
      color: t.color.system.error[800],
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: t.color.system.error.base,
    },
  }))
  .variants(() => ({
    subtle: {},
    solid: { borderLeftWidth: '0' },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'currentColor',
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
    },
  }))

export default Alert

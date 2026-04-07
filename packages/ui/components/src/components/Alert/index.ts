import { el } from '../../factory'

const Alert = el
  .config({ name: 'Alert' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'top', block: true })
  .theme((t) => ({
    padding: t.spacing.small,
    borderRadius: t.borderRadius.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
    backgroundColor: t.color.system.info[100],
    color: t.color.system.info[800],
    borderWidthLeft: '4px',
    borderStyleLeft: 'solid',
    borderColorLeft: t.color.system.info.base,
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'transparent',
  }))
  .states((t) => ({
    info: {
      backgroundColor: t.color.system.info[100],
      color: t.color.system.info[800],
      borderColorLeft: t.color.system.info.base,
    },
    success: {
      backgroundColor: t.color.system.success[100],
      color: t.color.system.success[800],
      borderColorLeft: t.color.system.success.base,
    },
    warning: {
      backgroundColor: t.color.system.warning[100],
      color: t.color.system.warning[800],
      borderColorLeft: t.color.system.warning.base,
    },
    error: {
      backgroundColor: t.color.system.error[100],
      color: t.color.system.error[800],
      borderColorLeft: t.color.system.error.base,
    },
  }))
  .variants((t) => ({
    subtle: {},
    solid: {
      backgroundColor: t.color.system.info.base,
      color: t.color.system.light.base,
      borderWidthLeft: '0',
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: '1px',
      borderColor: 'currentColor',
      borderWidthLeft: '1px',
    },
  }))

export default Alert

import { el } from '../../factory'

const Notification = el
  .config({ name: 'Notification' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'top', block: true })
  .theme((t) => ({
    padding: t.spacing.small,
    borderRadius: t.borderRadius.base,
    boxShadow: t.shadows.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
    backgroundColor: t.color.system.light.base,
    borderWidthLeft: '0',
    borderStyleLeft: 'solid',
    borderColorLeft: 'transparent',
  }))
  .states((t) => ({
    info: {
      borderWidthLeft: '4px',
      borderColorLeft: t.color.system.info.base,
    },
    success: {
      borderWidthLeft: '4px',
      borderColorLeft: t.color.system.success.base,
    },
    warning: {
      borderWidthLeft: '4px',
      borderColorLeft: t.color.system.warning.base,
    },
    error: {
      borderWidthLeft: '4px',
      borderColorLeft: t.color.system.error.base,
    },
  }))

export default Notification

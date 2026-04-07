import { el } from '../../factory'

const Notification = el
  .config({ name: 'Notification' })
  .attrs({ tag: 'div', direction: 'rows', block: true })
  .theme((t: any) => ({
    display: 'flex',
    alignItems: 'flex-start',
    padding: t.spacing.small,
    borderRadius: t.borderRadius.base,
    boxShadow: t.shadows.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
    backgroundColor: t.color.system.light.base,
  }))
  .states((t: any) => ({
    info: {
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: t.color.system.info.base,
    },
    success: {
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: t.color.system.success.base,
    },
    warning: {
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: t.color.system.warning.base,
    },
    error: {
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: t.color.system.error.base,
    },
  }))

export default Notification

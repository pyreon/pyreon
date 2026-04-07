import { el } from '../../factory'

const Pagination = el
  .config({ name: 'Pagination' })
  .attrs({ tag: 'nav', direction: 'inline', alignY: 'center', gap: 4 })
  .theme((t) => ({
    fontSize: t.fontSize.small,
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
      paddingLeft: t.spacing.xxSmall,
      paddingRight: t.spacing.xxSmall,
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
    },
    large: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
    },
  }))

export default Pagination

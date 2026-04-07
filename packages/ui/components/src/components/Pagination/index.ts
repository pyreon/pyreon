import { el } from '../../factory'

const Pagination = el
  .config({ name: 'Pagination' })
  .attrs({ tag: 'nav' })
  .theme((t) => ({
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing.xxxSmall,
  }))
  .sizes((t) => ({
    small: {
      gap: t.spacing.xxxSmall,
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
      paddingLeft: t.spacing.xxSmall,
      paddingRight: t.spacing.xxSmall,
    },
    medium: {
      gap: t.spacing.xxxSmall,
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
    },
    large: {
      gap: t.spacing.xxSmall,
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
    },
  }))

export default Pagination

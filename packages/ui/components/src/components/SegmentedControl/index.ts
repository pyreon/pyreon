import { el } from '../../factory'

const SegmentedControl = el
  .config({ name: 'SegmentedControl' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    display: 'inline-flex',
    backgroundColor: t.color.system.base[100],
    borderRadius: t.borderRadius.base,
    padding: t.spacing.xxxSmall,
  }))
  .states((t) => ({
    primary: { backgroundColor: t.color.system.base[100] },
  }))
  .sizes((t) => ({
    small: { padding: t.spacing.xxxSmall, borderRadius: t.borderRadius.small },
    medium: { padding: t.spacing.xxxSmall, borderRadius: t.borderRadius.base },
    large: { padding: t.spacing.xxxSmall, borderRadius: t.borderRadius.medium },
  }))

export default SegmentedControl

export const SegmentedControlItem = el
  .config({ name: 'SegmentedControlItem' })
  .attrs({ tag: 'button' })
  .theme((t) => ({
    cursor: 'pointer',
    fontWeight: t.fontWeight.medium,
    fontSize: t.fontSize.small,
    transition: t.transition.fast,
    borderRadius: t.borderRadius.small,
    color: t.color.system.base[600],
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    hover: { color: t.color.system.dark[800] },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
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

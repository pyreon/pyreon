import { el } from '../../factory'

const Tooltip = el
  .config({ name: 'Tooltip' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    backgroundColor: t.color.system.dark[800],
    color: t.color.system.light.base,
    fontSize: t.fontSize.xSmall,
    borderRadius: t.borderRadius.small,
    paddingTop: t.spacing.xxxSmall,
    paddingBottom: t.spacing.xxxSmall,
    paddingLeft: t.spacing.xxSmall,
    paddingRight: t.spacing.xxSmall,
    zIndex: 50,
    fontWeight: t.fontWeight.medium,
    lineHeight: t.lineHeight.base,
    pointerEvents: 'none',
    maxWidth: '200px',
  }))

export default Tooltip

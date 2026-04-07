import { el } from '../../factory'

const HoverCard = el
  .config({ name: 'HoverCard' })
  .attrs({ tag: 'div' })
  .theme((t: any) => ({
    backgroundColor: t.color.system.light.base,
    borderRadius: t.borderRadius.medium,
    boxShadow: t.shadows.medium,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[200],
    padding: t.spacing.small,
    zIndex: 50,
  }))

export default HoverCard

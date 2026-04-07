import { el } from '../../factory'

const Tree = el
  .config({ name: 'Tree' })
  .attrs({ tag: 'div', direction: 'rows', block: true })
  .theme((t) => ({
    fontSize: t.fontSize.small,
    color: t.color.system.base[700],
  }))

export default Tree

export const TreeItem = el
  .config({ name: 'TreeItem' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center', block: true })
  .theme((t) => ({
    cursor: 'pointer',
    borderRadius: t.borderRadius.small,
    fontSize: t.fontSize.small,
    color: t.color.system.base[700],
    transition: t.transition.fast,
    paddingTop: t.spacing.xxSmall,
    paddingBottom: t.spacing.xxSmall,
    paddingLeft: t.spacing.small,
    paddingRight: t.spacing.small,
    hover: {
      backgroundColor: t.color.system.base[100],
    },
    focus: {
      backgroundColor: t.color.system.base[100],
      outline: 'none',
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  }))
  .states((t) => ({
    selected: {
      backgroundColor: t.color.system.primary[50],
      color: t.color.system.primary[700],
    },
  }))

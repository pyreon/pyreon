import { el } from '../../factory'

const Card = el
  .config({ name: 'Card' })
  .attrs({ tag: 'div', direction: 'rows', block: true })
  .theme((t) => ({
    backgroundColor: t.color.system.light.base,
    borderRadius: t.borderRadius.medium,
    padding: t.spacing.medium,
  }))
  .variants((t) => ({
    elevated: { boxShadow: t.shadows.small },
    outline: {
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: t.color.system.base[200],
    },
    filled: {
      backgroundColor: t.color.system.base[50],
    },
  }))

export default Card

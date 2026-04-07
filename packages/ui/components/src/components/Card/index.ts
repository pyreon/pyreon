import { el } from '../../factory'

const Card = el
  .config({ name: 'Card' })
  .attrs({ tag: 'div', direction: 'rows', block: true })
  .theme((t: any) => ({
    backgroundColor: t.color.system.light.base,
    borderRadius: t.borderRadius.medium,
    padding: t.spacing.medium,
  }))
  .variants((t: any) => ({
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

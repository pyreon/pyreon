import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Card = rocketstyle({ useBooleans: true })({ name: 'Card', component: Element })
  .attrs({ tag: 'div', direction: 'rows', block: true })
  .theme({
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    overflow: 'hidden',
  })
  .variants({
    elevated: {
      boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    },
    outline: {
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#e5e7eb',
    },
    filled: {
      backgroundColor: '#f9fafb',
    },
  })
  .sizes({
    sm: { padding: 12, borderRadius: 6 },
    md: { padding: 16, borderRadius: 8 },
    lg: { padding: 24, borderRadius: 12 },
  })

export default Card

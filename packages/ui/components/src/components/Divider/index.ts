import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Divider = rocketstyle({ useBooleans: true })({ name: 'Divider', component: Element })
  .attrs({ tag: 'hr' })
  .theme({
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: '#e5e7eb',
    margin: 0,
    width: '100%',
  })
  .variants({
    solid: { borderTopStyle: 'solid' },
    dashed: { borderTopStyle: 'dashed' },
    dotted: { borderTopStyle: 'dotted' },
  })
  .sizes({
    sm: { borderTopWidth: 1 },
    md: { borderTopWidth: 2 },
    lg: { borderTopWidth: 4 },
  })

export default Divider

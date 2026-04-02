import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Stack = rocketstyle({ useBooleans: true })({ name: 'Stack', component: Element })
  .attrs({ tag: 'div', direction: 'rows', block: true })
  .theme({ gap: 16 })
  .sizes({
    xs: { gap: 4 },
    sm: { gap: 8 },
    md: { gap: 16 },
    lg: { gap: 24 },
    xl: { gap: 32 },
  })

export default Stack

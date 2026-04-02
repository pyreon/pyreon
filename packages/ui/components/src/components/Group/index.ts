import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Group = rocketstyle({ useBooleans: true })({ name: 'Group', component: Element })
  .attrs({ tag: 'div', direction: 'inline', block: true })
  .theme({ gap: 8, flexWrap: 'wrap' })
  .sizes({
    xs: { gap: 4 },
    sm: { gap: 8 },
    md: { gap: 16 },
    lg: { gap: 24 },
    xl: { gap: 32 },
  })

export default Group

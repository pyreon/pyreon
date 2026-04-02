import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const ButtonGroup = rocketstyle({ useBooleans: true })({ name: 'ButtonGroup', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme({
    display: 'inline-flex',
  })
  .variants({
    attached: {
      gap: 0,
      '& > *': { borderRadius: 0 },
      '& > *:first-child': { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
      '& > *:last-child': { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
    },
    separated: {
      gap: 8,
    },
  })

export default ButtonGroup

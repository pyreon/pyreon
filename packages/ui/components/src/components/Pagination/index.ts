import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Pagination = rocketstyle({ useBooleans: true })({
  name: 'Pagination',
  component: Element,
})
  .attrs({ tag: 'nav' } as any)
  .theme({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  })
  .sizes({
    sm: { gap: 2, fontSize: 12 },
    md: { gap: 4, fontSize: 14 },
    lg: { gap: 6, fontSize: 16 },
  })

export default Pagination

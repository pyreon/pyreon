import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Tooltip = rocketstyle({ useBooleans: true })({
  name: 'Tooltip',
  component: Element,
})
  .attrs({ tag: 'div' } as any)
  .theme({
    backgroundColor: '#111827',
    color: '#ffffff',
    fontSize: 12,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 4,
    zIndex: 50,
    whiteSpace: 'nowrap',
  })
  .sizes({
    sm: { fontSize: 11, paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6 },
    md: { fontSize: 12, paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8 },
  })

export default Tooltip

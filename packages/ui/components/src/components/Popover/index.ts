import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Popover = rocketstyle({ useBooleans: true })({
  name: 'Popover',
  component: Element,
})
  .attrs({ tag: 'div' } as any)
  .theme({
    backgroundColor: '#ffffff',
    borderRadius: 8,
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    padding: 12,
    zIndex: 40,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
  })
  .sizes({
    sm: { padding: 8, maxWidth: 240 },
    md: { padding: 12, maxWidth: 320 },
    lg: { padding: 16, maxWidth: 480 },
  })

export default Popover

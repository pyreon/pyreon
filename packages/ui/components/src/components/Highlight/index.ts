import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Highlight = rocketstyle({ useBooleans: true })({ name: 'Highlight', component: Text })
  .attrs({ tag: 'span' } as any)
  .theme({
    backgroundColor: '#fef08a',
    color: 'inherit',
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 4,
    paddingRight: 4,
    borderRadius: 2,
  })
  .states({
    primary: { backgroundColor: '#bfdbfe' },
    success: { backgroundColor: '#bbf7d0' },
    warning: { backgroundColor: '#fde68a' },
    error: { backgroundColor: '#fecaca' },
  })

export default Highlight

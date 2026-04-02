import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Paragraph = rocketstyle({ useBooleans: true })({ name: 'Paragraph', component: Text })
  .attrs({ tag: 'p' })
  .theme({
    fontSize: 16,
    lineHeight: 1.5,
    color: '#374151',
    margin: 0,
  })
  .sizes({
    sm: { fontSize: 14 },
    md: { fontSize: 16 },
    lg: { fontSize: 18 },
  })

export default Paragraph

import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Title = rocketstyle({ useBooleans: true })({ name: 'Title', component: Text })
  .attrs({ tag: 'h2' })
  .theme({
    fontWeight: 700,
    lineHeight: 1.25,
    color: '#111827',
    margin: 0,
  })
  .sizes({
    h1: { fontSize: 36, lineHeight: 1.2 },
    h2: { fontSize: 30, lineHeight: 1.25 },
    h3: { fontSize: 24, lineHeight: 1.3 },
    h4: { fontSize: 20, lineHeight: 1.35 },
    h5: { fontSize: 18, lineHeight: 1.4 },
    h6: { fontSize: 16, lineHeight: 1.4 },
  })

export default Title

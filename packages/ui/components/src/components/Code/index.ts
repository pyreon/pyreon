import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Code = rocketstyle({ useBooleans: true })({ name: 'Code', component: Text })
  .attrs({ tag: 'code' })
  .theme({
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: 13,
    backgroundColor: '#f3f4f6',
    color: '#1f2937',
    borderRadius: 4,
    paddingLeft: 4,
    paddingRight: 4,
    paddingTop: 2,
    paddingBottom: 2,
  })
  .variants({
    inline: {
      display: 'inline',
      paddingLeft: 4,
      paddingRight: 4,
      paddingTop: 2,
      paddingBottom: 2,
    },
    block: {
      display: 'block',
      whiteSpace: 'pre',
      overflowX: 'auto',
      padding: 16,
      borderRadius: 8,
      lineHeight: 1.6,
    },
  })

export default Code

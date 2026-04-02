import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Kbd = rocketstyle({ useBooleans: true })({ name: 'Kbd', component: Text })
  .attrs({ tag: 'kbd' })
  .theme({
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    fontWeight: 500,
    backgroundColor: '#f3f4f6',
    color: '#374151',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 2,
    paddingBottom: 2,
    lineHeight: 1.5,
    display: 'inline-block',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 0 0 #d1d5db',
  })

export default Kbd

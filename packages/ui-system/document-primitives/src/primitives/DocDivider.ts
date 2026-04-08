import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const DocDivider = rocketstyle()({ name: 'DocDivider', component: Element })
  .theme({
    borderColor: '#dddddd',
    borderWidth: 1,
  })
  .statics({ _documentType: 'divider' as const })
  .attrs<{
    color?: string
    thickness?: number
  }>((props) => ({
    tag: 'hr',
    _documentProps: {
      ...(props.color ? { color: props.color } : {}),
      ...(props.thickness ? { thickness: props.thickness } : {}),
    },
  }))

export default DocDivider

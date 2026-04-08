import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const DocColumn = rocketstyle()({ name: 'DocColumn', component: Element })
  .statics({ _documentType: 'column' as const })
  .attrs<{ width?: number | string }>((props) => ({
    tag: 'div',
    _documentProps: props.width != null ? { width: props.width } : {},
  }))

export default DocColumn

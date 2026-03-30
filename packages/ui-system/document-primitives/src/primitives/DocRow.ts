import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const DocRow = rocketstyle()({ name: 'DocRow', component: Element })
  .theme({
    direction: 'row',
  })
  .statics({ _documentType: 'row' as const })
  .attrs<{ tag: string; _documentProps: Record<string, unknown> }>((_props) => ({
    tag: 'div',
    _documentProps: {},
  }))

export default DocRow

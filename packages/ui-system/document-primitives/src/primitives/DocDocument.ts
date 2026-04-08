import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const DocDocument = rocketstyle()({ name: 'DocDocument', component: Element })
  .statics({ _documentType: 'document' as const })
  .attrs<{
    title?: string
    author?: string
    subject?: string
  }>((props) => ({
    tag: 'div',
    _documentProps: {
      ...(props.title ? { title: props.title } : {}),
      ...(props.author ? { author: props.author } : {}),
      ...(props.subject ? { subject: props.subject } : {}),
    },
  }))

export default DocDocument

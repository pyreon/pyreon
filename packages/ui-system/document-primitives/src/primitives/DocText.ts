import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const DocText = rocketstyle({
  dimensions: {
    variants: 'variant',
    weights: 'weight',
  },
  useBooleans: true,
})({ name: 'DocText', component: Text })
  .theme({
    color: '#333333',
    lineHeight: 1.5,
    marginBottom: 8,
  })
  .variants({
    body: { fontSize: 14 },
    caption: { fontSize: 12, color: '#666666' },
    label: { fontSize: 11, fontWeight: 'bold' },
  })
  .weights({
    normal: { fontWeight: 'normal' },
    bold: { fontWeight: 'bold' },
  })
  .statics({ _documentType: 'text' as const })
  // .attrs(
  //   (props: any) =>
  //     ({
  //       tag: "p",
  .attrs<{ tag: string; _documentProps: Record<string, unknown> }>((_props) => ({
    tag: 'p',
    _documentProps: {},
  }))

export default DocText

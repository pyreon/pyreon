import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const DocumentPreview = rocketstyle({
  dimensions: {
    sizes: 'size',
  },
  useBooleans: true,
})({ name: 'DocumentPreview', component: Element })
  .theme({
    backgroundColor: '#f5f5f5',
    padding: 40,
  })
  .sizes({
    A4: { width: '210mm', minHeight: '297mm' },
    A3: { width: '297mm', minHeight: '420mm' },
    A5: { width: '148mm', minHeight: '210mm' },
    letter: { width: '8.5in', minHeight: '11in' },
    legal: { width: '8.5in', minHeight: '14in' },
  })
  .styles(
    (css: any) => css`
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;

      & > * {
        background: white;
        padding: 25mm;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        margin: 20px 0;
      }
    `,
  )
  .statics({ _documentType: 'document' as const })
  .attrs<{
    size?: string
    showPageBreaks?: boolean
  }>((props) => ({
    tag: 'div',
    _documentProps: {
      ...(props.size ? { size: props.size } : { size: 'A4' }),
      ...(props.showPageBreaks ? { showPageBreaks: props.showPageBreaks } : {}),
    },
  }))

export default DocumentPreview

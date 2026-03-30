import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const DocButton = rocketstyle({
  dimensions: {
    variants: 'variant',
  },
  useBooleans: true,
})({ name: 'DocButton', component: Text })
  .theme({
    fontSize: 14,
    fontWeight: 'bold',
    padding: '10px 24px',
    borderRadius: 4,
    textAlign: 'center',
    textDecoration: 'none',
  })
  .variants({
    primary: {
      backgroundColor: '#4f46e5',
      color: '#ffffff',
    },
    secondary: {
      backgroundColor: '#ffffff',
      color: '#4f46e5',
      borderWidth: 1,
      borderColor: '#4f46e5',
      borderStyle: 'solid',
    },
  })
  .statics({ _documentType: 'button' as const })
  .attrs<{ href?: string; tag: string; _documentProps: { href: string } }>((props) => ({
    tag: 'a',
    _documentProps: { href: props.href ?? '#' },
  }))

export default DocButton

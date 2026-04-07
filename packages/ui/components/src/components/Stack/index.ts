import { el } from '../../factory'

const Stack = el
  .config({ name: 'Stack' })
  .attrs({ tag: 'div', direction: 'rows', block: true })
  .theme(() => ({
    display: 'flex',
    flexDirection: 'column',
  }))
  .sizes((t) => ({
    xSmall: { gap: t.spacing.xxxSmall },
    small: { gap: t.spacing.xxSmall },
    medium: { gap: t.spacing.small },
    large: { gap: t.spacing.medium },
    xLarge: { gap: t.spacing.large },
  }))

export default Stack

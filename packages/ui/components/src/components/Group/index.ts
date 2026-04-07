import { el } from '../../factory'

const Group = el
  .config({ name: 'Group' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center', block: true })
  .theme(() => ({
    flexWrap: 'wrap',
  }))
  .sizes((t) => ({
    xSmall: { gap: t.spacing.xxxSmall },
    small: { gap: t.spacing.xxSmall },
    medium: { gap: t.spacing.small },
    large: { gap: t.spacing.medium },
    xLarge: { gap: t.spacing.large },
  }))

export default Group

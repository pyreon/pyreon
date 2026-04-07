import { el } from '../../factory'

const Group = el
  .config({ name: 'Group' })
  .attrs({ tag: 'div', direction: 'inline', block: true })
  .theme(() => ({
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  }))
  .sizes((t) => ({
    xSmall: { gap: t.spacing.xxxSmall },
    small: { gap: t.spacing.xxSmall },
    medium: { gap: t.spacing.small },
    large: { gap: t.spacing.medium },
    xLarge: { gap: t.spacing.large },
  }))

export default Group

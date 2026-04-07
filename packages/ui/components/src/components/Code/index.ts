import { txt } from '../../factory'

const Code = txt
  .config({ name: 'Code' })
  .attrs({ tag: 'code' })
  .theme((t) => ({
    fontFamily: 'monospace',
    fontSize: t.fontSize.small,
    backgroundColor: t.color.system.base[100],
    color: t.color.system.base[800],
  }))
  .variants((t) => ({
    inline: {
      display: 'inline',
      padding: `0 ${t.spacing.xxxSmall}`,
      borderRadius: t.borderRadius.small,
    },
    block: {
      display: 'block',
      padding: t.spacing.small,
      borderRadius: t.borderRadius.base,
      overflowX: 'auto',
      lineHeight: t.lineHeight.large,
    },
  }))

export default Code

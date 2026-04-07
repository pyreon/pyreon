import { txt } from '../../factory'

const Kbd = txt
  .config({ name: 'Kbd' })
  .attrs({ tag: 'kbd' })
  .theme((t: any) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'monospace',
    fontSize: t.fontSize.small,
    fontWeight: t.fontWeight.medium,
    lineHeight: t.lineHeight.small,
    backgroundColor: t.color.system.base[100],
    color: t.color.system.base[800],
    borderRadius: t.borderRadius.small,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: t.color.system.base[300],
    borderBottomWidth: '2px',
    paddingLeft: t.spacing.xxSmall,
    paddingRight: t.spacing.xxSmall,
    paddingTop: 0,
    paddingBottom: 0,
    whiteSpace: 'nowrap',
  }))

export default Kbd

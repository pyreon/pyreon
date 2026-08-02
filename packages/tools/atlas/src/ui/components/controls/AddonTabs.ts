import { el, type T } from '../../kit'

export const AddonTabs = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'row',
    // Eleven addon tabs never fit a 352px panel — wrap instead of the old
    // overflowX:auto, whose hidden scroll clipped half the strip with no
    // affordance that more tabs existed.
    flexWrap: 'wrap',
    padding: '8px 8px',
    gap: '2px',
    borderBottom: t.hairline,
  }))

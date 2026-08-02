import { el, type T } from '../../kit'

export const AddonTabs = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 2,
  })
  .theme((t: T) => ({
    // Eleven addon tabs never fit a 352px panel — wrap instead of the old
    // overflowX:auto, whose hidden scroll clipped half the strip with no
    // affordance that more tabs existed.
    flexWrap: 'wrap',
    padding: '8px 8px',
    borderBottom: t.hairline,
  }))

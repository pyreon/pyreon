import { el } from '../../factory'

const Timeline = el
  .config({ name: 'Timeline' })
  .attrs({ tag: 'div', direction: 'rows', contentDirection: 'rows', contentAlignX: 'left', contentAlignY: 'center' })
  .theme((t) => ({
    paddingLeft: t.spacing.medium,
    borderWidthLeft: '2px',
    borderStyleLeft: 'solid',
    borderColorLeft: t.color.system.base[200],
  }))

export default Timeline

/**
 * A Timeline entry: marker dot sits ON the Timeline's border line (absolute,
 * pulled left over the rail), content flows beside it. `state="active"`
 * highlights the marker; `state="completed"` additionally switches the marker
 * to a ✓ glyph — distinguishable WITHOUT color (WCAG 1.4.1).
 */
/**
 * A marker colour {@link TimelineItem}'s `.theme()` set, as its `.styles()`
 * receives it (resolved for the mode; the declared type of a `mode(light,
 * dark)` value is its callback, so it is read as `unknown`).
 */
const marker = (theme: Record<string, unknown>, key: string): string => {
  const value = theme[key]
  return typeof value === 'string' ? value : ''
}

export const TimelineItem = el
  .config({ name: 'TimelineItem' })
  .attrs({ tag: 'div', direction: 'rows',
    contentDirection: 'rows',
    contentAlignX: 'left',
    contentAlignY: 'center', gap: 1 })
  .theme((t, m) => ({
    position: 'relative',
    paddingBottom: t.spacing.medium,
    // The marker, drawn by the `.styles()` below for the active `state`. Its
    // ring is the page colour, so the dot sits ON the rail in either mode (a
    // white ring showed on the dark page). Keys rather than an `extendCss`
    // string, because a `mode(light, dark)` value cannot be interpolated into
    // a string.
    markerFill: t.color.system.base[300],
    markerRing: m(t.color.system.light.base, t.color.system.dark.base),
    markerActive: t.color.system.primary.base,
    markerDone: t.color.system.success.base,
    markerDoneText: t.color.system.success.contrast,
  }))
  // `active` highlights the marker; `completed` swaps it for a ✓ glyph.
  .states(() => ({
    active: {},
    completed: {},
  }))
  .styles(
    (css) => css`
      ${({ $rocketstyle: s, $rocketstate }: { $rocketstyle: Record<string, unknown>; $rocketstate: Record<string, unknown> }) =>
        $rocketstate.state === 'completed'
          ? css`
              &::before {
                content: '✓';
                position: absolute;
                left: -24px;
                top: 0;
                width: 16px;
                height: 16px;
                line-height: 16px;
                text-align: center;
                font-size: 10px;
                border-radius: 50%;
                background: ${marker(s, 'markerDone')};
                color: ${marker(s, 'markerDoneText')};
              }
            `
          : css`
              &::before {
                content: '';
                position: absolute;
                left: -21px;
                top: 4px;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: ${$rocketstate.state === 'active' ? marker(s, 'markerActive') : marker(s, 'markerFill')};
                border: 2px solid ${marker(s, 'markerRing')};
              }
            `}
    `,
  )

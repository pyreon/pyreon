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
export const TimelineItem = el
  .config({ name: 'TimelineItem' })
  .attrs({ tag: 'div', direction: 'rows',
    contentDirection: 'rows',
    contentAlignX: 'left',
    contentAlignY: 'center', gap: 1 })
  .theme((t) => ({
    position: 'relative',
    paddingBottom: t.spacing.medium,
    extendCss: `
      &::before {
        content: '';
        position: absolute;
        left: -21px;
        top: 4px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: ${t.color.system.base[300]};
        border: 2px solid ${t.color.system.light.base};
      }
    `,
  }))
  .states((t) => ({
    active: {
      extendCss: `
        &::before {
          content: '';
          position: absolute;
          left: -21px;
          top: 4px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: ${t.color.system.primary.base};
          border: 2px solid ${t.color.system.light.base};
        }
      `,
    },
    completed: {
      extendCss: `
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
          background: ${t.color.system.success.base};
          color: ${t.color.system.light.base};
        }
      `,
    },
  }))

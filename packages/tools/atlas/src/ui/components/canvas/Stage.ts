import { el } from '../../kit'

/**
 * The canvas stage (`.at-canvas`): the app background with an optional dot
 * grid (Canvas → Grid), the preview centred on it.
 */
export const Stage = el
  .attrs({
    tag: 'div',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t) => ({
    position: 'relative',
    flex: '1',
    minHeight: '0',
    minWidth: '0',
    overflow: 'auto',
    padding: '40px 24px',
    backgroundColor: t.bg,
  }))
  .states((t) => ({
    grid: {
      backgroundSize: '16px 16px',
      extendCss: `background-image:radial-gradient(circle,${t.dotColor} 1px,transparent 1px);`,
    },
    plain: {},
  }))
  // Fullscreen layout: the frame spans the stage edge to edge.
  .multiple(() => ({
    centered: {},
    padded: {},
    fullscreen: { padding: '0' },
  }))

import { el, type T } from '../../kit'

export const Stage = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    position: 'relative',
    flex: '1',
    minHeight: '0',
    overflow: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    backgroundColor: t.bg,
    backgroundSize: '22px 22px',
    extendCss: `background-image:radial-gradient(${t.dotColor} 1px,transparent 1px);`,
  })) // The Viewport addon is a rocketstyle `size` dimension, not an inline width:
// the presets are a closed set, so they resolve to cached classes like every
// other style here (the workbench ships zero inline styles). `vFull` keeps the
// fluid default; the rest pin the canvas to a real unistyle breakpoint, capped
// at the stage width so a desktop preset never overflows on a small screen.

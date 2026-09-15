import { dim, el, type T } from '../../kit'

export const Frame = el
  // The structural css lives in the THEME (not `.attrs({ css })`) so the
  // per-instance `css` PROP stays free: it is the channel a project-defined
  // viewport preset pins its width through (a hashed class, not an inline
  // style — the workbench ships none).
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({ overflow: 'hidden', transition: 'width .16s ease' }))
  // `framed` only when a viewport preset PINS a width — then the edge IS
  // information (where the device ends). At the fluid default the component
  // sits directly on the dotted stage: a second card inside the canvas said
  // nothing the stage did not, and hid the real background behind its own.
  .variants(dim((t: T) => ({
    bare: { background: 'transparent', border: 'none', boxShadow: 'none', borderRadius: '0' },
    framed: {
      borderRadius: t.radius.stage,
      boxShadow: '0 20px 50px -24px rgba(15,18,30,.35)',
      border: t.hairline,
      background: t.surface,
    },
  })))
  .sizes(() => ({
    vFull: {},
    vMobile: { width: '375px', maxWidth: '100%' },
    vTablet: { width: '768px', maxWidth: '100%' },
    vDesktop: { width: '1280px', maxWidth: '100%' },
  }))

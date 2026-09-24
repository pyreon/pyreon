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
  // `bare` is the FLUID frame, and it spans the stage: `width: 100%` lives on
  // this variant rather than in the theme or on the `vFull` size, because the
  // pinned frame must keep the width its preset gives it — a shipped preset
  // through the size dimension, a per-project one through the `css` prop —
  // and a width in either of the other layers outranked the `css` prop and
  // pinned a kiosk preset at the stage width. Without any width the frame —
  // an inline-flex Element — shrink-wrapped its content, and the preview
  // surface inside it measured 80px (its own padding) on the deployed
  // workbench: every block-level component (`<hr>`, `<table>`, a slider
  // track, a tree) collapsed to 0 width and read as "renders nothing".
  .variants(dim((t: T) => ({
    bare: { width: '100%', background: 'transparent', border: 'none', boxShadow: 'none', borderRadius: '0' },
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

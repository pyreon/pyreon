import { el, type T } from '../../kit'

export const Frame = el
  // The structural css lives in the THEME (not `.attrs({ css })`) so the
  // per-instance `css` PROP stays free: it is the channel a project-defined
  // viewport preset pins its width through (a hashed class, not an inline
  // style — the workbench ships none).
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t: T) => ({ borderRadius: t.radius.stage, overflow: 'hidden', boxShadow: '0 20px 50px -24px rgba(15,18,30,.35)', border: t.hairline, background: t.surface, transition: 'width .16s ease' }))
  .sizes(() => ({
    vFull: {},
    vMobile: { width: '375px', maxWidth: '100%' },
    vTablet: { width: '768px', maxWidth: '100%' },
    vDesktop: { width: '1280px', maxWidth: '100%' },
  }))

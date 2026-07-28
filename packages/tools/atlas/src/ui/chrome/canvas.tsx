/** Canvas view — the toolbar, the dotted stage, and the zoomable preview frame. */
import { cx, dim, el, txt, type T } from '../kit'

export const CanvasBar = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => ({ height: '52px', flex: 'none', display: 'flex', alignItems: 'center', gap: '14px', padding: '0 16px', borderBottom: `1px solid ${t.border}`, background: `${t.surface}` }))
export const CanvasName = txt.attrs({ tag: 'span' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:15px;"))
export const CanvasPath = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', fontSize: '10px', color: `${t.faint}` }))
export const ZoomLabel = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', fontSize: '11px', width: '42px', textAlign: 'center', color: `${t.muted}` }))
export const ZoomBtn = el.attrs({ tag: 'button' }).theme((t: T) => ({ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', width: '26px', height: '26px', borderRadius: '6px', fontSize: '15px', color: `${t.text}`, hover: { background: `${t.surface2}` } }))
export const Stage = el.attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;' }).theme((t: T) => ({ flex: '1', minHeight: '0', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', backgroundColor: `${t.bg}`, backgroundSize: '22px 22px', extendCss: `background-image:radial-gradient(${t.dotColor} 1px,transparent 1px);` }))
// The Viewport addon is a rocketstyle `size` dimension, not an inline width:
// the presets are a closed set, so they resolve to cached classes like every
// other style here (the workbench ships zero inline styles). `vFull` keeps the
// fluid default; the rest pin the canvas to a real unistyle breakpoint, capped
// at the stage width so a desktop preset never overflows on a small screen.
export const Frame = el
  .attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' })
  .theme((t: T) => ({ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 50px -24px rgba(15,18,30,.35)', border: `1px solid ${t.border}`, background: `${t.surface}`, transition: 'width .16s ease' }))
  .sizes(() => ({
    vFull: {},
    vMobile: { width: '375px', maxWidth: '100%' },
    vTablet: { width: '768px', maxWidth: '100%' },
    vDesktop: { width: '1280px', maxWidth: '100%' },
  }))
export const FrameChrome = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;' }).theme((t: T) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: `1px solid ${t.border}`, background: `${t.chrome}`, fontFamily: '\'JetBrains Mono\',monospace', fontSize: '10px', color: `${t.muted}` }))
export const PreviewSurface = el
  .attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;' })
  .theme(() => ({ padding: '56px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '220px', transition: 'transform .12s ease', transformOrigin: 'center' }))
  .sizes(() => ({
    z50: { transform: 'scale(.5)' },
    z75: { transform: 'scale(.75)' },
    z100: { transform: 'scale(1)' },
    z125: { transform: 'scale(1.25)' },
    z150: { transform: 'scale(1.5)' },
    z175: { transform: 'scale(1.75)' },
    z200: { transform: 'scale(2)' },
  }))
  // Backgrounds addon — a `variant` dimension. `bgTheme` inherits the frame
  // surface (the default: what the component actually sits on); the others
  // force a fixed surface so you can check contrast against the opposite mode
  // without switching the whole workbench, and `bgChecker` is the transparency
  // grid for translucent surfaces and shadows.
  .variants(dim((t) => ({
    bgTheme: { backgroundColor: t.surface },
    bgLight: { backgroundColor: '#ffffff' },
    bgDark: { backgroundColor: '#0f0f14' },
    bgChecker: {
      backgroundColor: '#ffffff',
      backgroundImage:
        'repeating-conic-gradient(rgba(128,128,128,.18) 0% 25%, transparent 0% 50%)',
      backgroundSize: '16px 16px',
    },
  })))
  // Outline addon — a `state` dimension scoped to the preview subtree, so the
  // workbench chrome stays readable while every box in the component under
  // test is outlined (a stray wrapper / collapsed flex child / misplaced
  // padding shows up immediately).
  .states(() => ({
    outlined: {
      extendCss:
        '& *, & *::before, & *::after { outline: 1px solid rgba(255,45,85,.45) !important; outline-offset: -1px; }',
    },
    plain: {},
  }))

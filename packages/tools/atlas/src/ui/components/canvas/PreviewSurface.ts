import { el } from '../../kit'
import { OUTLINE_CSS } from '../../addons'
import { PREVIEW_COLORS } from '../../theme'

export const PreviewSurface = el
  .attrs({
    tag: 'div',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t) => ({
    padding: '40px',
    // No `minHeight` here: the canvas sets it through the per-instance `css`
    // prop (220px closed, taller while an adopted overlay is open), and a theme
    // value would outrank that prop.
    transformOrigin: 'center',
    // The CONTAINING BLOCK for the overlays the canvas adopts (see
    // ../../portal-adopt): a component's `position: fixed` modal backdrop is
    // confined to this surface instead of covering the workbench. The zoom
    // `transform` below already establishes one; `contain: layout` states it
    // independently of the zoom level and of any future transform change.
    contain: 'layout',
    transition: `transform ${t.motion.base} ease, min-height ${t.motion.base} ease`,
    // The surface's own edge. In light mode the stage, the frame and a
    // `bgTheme` surface are all white, so without it the preview had no
    // boundary at all — the component floated on an empty page.
    borderRadius: t.radius.card,
    border: t.hairline,
  }))
  .sizes(() => ({
    z50: { transform: 'scale(.5)' },
    z75: { transform: 'scale(.75)' },
    z100: { transform: 'scale(1)' },
    z125: { transform: 'scale(1.25)' },
    z150: { transform: 'scale(1.5)' },
    z175: { transform: 'scale(1.75)' },
    z200: { transform: 'scale(2)' },
  })) // Backgrounds addon — a `variant` dimension. `bgTheme` inherits the frame
  // surface (the default: what the component actually sits on); the others
  // force a fixed surface so you can check contrast against the opposite mode
  // without switching the whole workbench, and `bgChecker` is the transparency
  // grid for translucent surfaces and shadows.
  .variants((t) => ({
    bgTheme: { backgroundColor: t.surface },
    bgLight: { backgroundColor: PREVIEW_COLORS.light },
    bgDark: { backgroundColor: PREVIEW_COLORS.dark },
    bgChecker: {
      backgroundColor: PREVIEW_COLORS.light,
      // Raw CSS, not the `backgroundImage` key: unistyle wraps that key's
      // value in `url()`, which turned this gradient into an invalid value
      // and left the "checker" background plain white.
      extendCss: `background-image:repeating-conic-gradient(${PREVIEW_COLORS.checker} 0% 25%, transparent 0% 50%);`,
      backgroundSize: '16px 16px',
    },
  }))
  // Outline addon — a `state` dimension scoped to the preview subtree, so the
  // workbench chrome stays readable while every box in the component under
  // test is outlined (a stray wrapper / collapsed flex child / misplaced
  // padding shows up immediately).
  .states(() => ({
    outlined: {
      extendCss: OUTLINE_CSS,
    },
    plain: {},
  }))
  // Canvas → Layout (Storybook's `layout`). `centered` is the theme above;
  // the other two move the component to the top-left — where a form or a
  // table sits in a page — and `fullscreen` also drops the gutter and the
  // surface edge so a page section can touch the frame. Alignment goes
  // through `extendCss` because it overrides the centring the attrs set.
  .multiple(() => ({
    centered: {},
    padded: {
      padding: '16px',
      extendCss: 'justify-content:flex-start;align-items:flex-start;',
    },
    fullscreen: {
      padding: '0',
      border: 'none',
      borderRadius: '0',
      extendCss: 'justify-content:flex-start;align-items:stretch;flex:1 1 auto;',
    },
  }))

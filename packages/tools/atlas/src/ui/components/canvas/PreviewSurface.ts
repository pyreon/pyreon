import { dim, el, type T } from '../../kit'

export const PreviewSurface = el
  .attrs({
    tag: 'div',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t: T) => ({
    padding: '56px 40px',
    minHeight: '220px',
    transition: `transform ${t.motion.base} ease`,
    transformOrigin: 'center',
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

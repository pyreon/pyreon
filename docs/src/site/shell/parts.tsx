import { font, layout, motion, navMedia, radius, text, weight, z } from '../theme'
import { el, focusRing, tone, txt, type LinkAttrs, type ButtonAttrs } from '../kit/bases'

/**
 * Styled pieces of the marketing shell. Kept apart from the behaviour
 * (SiteHeader / MegaMenu / MobileSheet / SiteFooter) so the shell files read
 * as markup + state.
 */

/** Visibility around the 960px nav collapse (not a theme breakpoint, so raw @media). */
const hideBelowNav = { extendCss: `${navMedia.collapsed} { display: none; }` } as const
const showBelowNav = { extendCss: `${navMedia.expanded} { display: none; }` } as const

export const SkipLink = el
  .config({ name: 'SkipLink' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    position: 'fixed',
    top: 8,
    left: 8,
    zIndex: z.skip,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 16,
    paddingRight: 16,
    borderRadius: radius.control,
    backgroundColor: tone(m, 'solidBg'),
    color: tone(m, 'solidText'),
    fontFamily: font.sans,
    fontSize: text.ui.size,
    fontWeight: weight.medium,
    textDecoration: 'none',
    transform: 'translateY(-200%)',
    focus: { ...focusRing(m), transform: 'none' },
  }))

export const HeaderRoot = el
  .config({ name: 'SiteHeader' })
  .attrs({ tag: 'header', block: true })
  .theme(() => ({
    position: 'fixed',
    top: layout.navTop,
    left: 0,
    right: 0,
    zIndex: z.nav,
    paddingLeft: layout.gutter.xs,
    paddingRight: layout.gutter.xs,
    pointerEvents: 'none',
  }))

export const Bar = el
  .config({ name: 'SiteBar' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: { xs: 8, lg: 24 } })
  .theme((_t, m) => ({
    position: 'relative',
    // Above the mobile sheet (a sibling in the header), so the bar and its
    // close button stay on top while the sheet is open.
    zIndex: z.panel,
    pointerEvents: 'auto',
    maxWidth: layout.navMaxWidth,
    marginLeft: 'auto',
    marginRight: 'auto',
    height: layout.navHeight,
    paddingLeft: { xs: 16, sm: 20 },
    paddingRight: 8,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'glass'),
    backdropFilter: 'blur(18px) saturate(140%)',
    extendCss: '-webkit-backdrop-filter: blur(18px) saturate(140%);',
  }))

export const MarkLink = el
  .config({ name: 'SiteMark' })
  .attrs<LinkAttrs>({ tag: 'a', contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({
    flexShrink: 0,
    color: tone(m, 'strong'),
    textDecoration: 'none',
    borderRadius: radius.small,
    focus: focusRing(m),
  }))

export const Wordmark = txt
  .config({ name: 'SiteWordmark' })
  .attrs({ tag: 'span' })
  .theme(() => ({
    fontFamily: font.sans,
    fontWeight: weight.semibold,
    fontSize: text.wordmark.size,
    letterSpacing: '-.02em',
    // The glyph alone on the narrowest phones, so the bar never overflows.
    extendCss: '@media (max-width: 379.98px) { display: none; }',
  }))

export const PrimaryNav = el
  .config({ name: 'SitePrimaryNav' })
  .attrs({ tag: 'nav', contentDirection: 'inline', contentAlignY: 'center', gap: 22 })
  // position: static so the menu panels are placed against the bar, not the nav.
  .theme(() => ({ ...hideBelowNav, height: '100%', position: 'static' }))

export const NavLinkText = el
  .config({ name: 'SiteNavLink' })
  .attrs<LinkAttrs & ButtonAttrs>({ tag: 'a', contentDirection: 'inline', contentAlignY: 'center', gap: 6 })
  .theme((_t, m) => ({
    fontFamily: font.sans,
    fontSize: text.navLink.size,
    color: tone(m, 'mist'),
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    borderRadius: radius.small,
    backgroundColor: 'transparent',
    border: 'none',
    padding: 0,
    transition: `color ${motion.hover}`,
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
  }))
  .states((_t, m) => ({ default: {}, current: { color: tone(m, 'text') } }))

export const Spacer = el.config({ name: 'SiteSpacer' }).attrs({ block: true }).theme(() => ({ flexGrow: 1, flexShrink: 1, minWidth: 0 }))

export const IconButton = el
  .config({ name: 'SiteIconButton' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignX: 'center', contentAlignY: 'center' })
  .theme((_t, m) => ({
    width: 36,
    height: 36,
    flexShrink: 0,
    padding: 0,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: 'transparent',
    color: tone(m, 'mist'),
    transition: `color ${motion.hover}, border-color ${motion.hover}`,
    hover: { color: tone(m, 'text'), borderColor: tone(m, 'line2') },
    focus: focusRing(m),
  }))

export const MenuButtonBox = el
  .config({ name: 'SiteMenuButton' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignX: 'center', contentAlignY: 'center' })
  .theme((_t, m) => ({
    ...showBelowNav,
    width: 36,
    height: 36,
    flexShrink: 0,
    padding: 0,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: 'transparent',
    color: tone(m, 'text'),
    focus: focusRing(m),
  }))

/** Desktop-only wrapper (the "Start a project" pill). */
export const DesktopOnly = el.config({ name: 'SiteDesktopOnly' }).theme(() => ({ ...hideBelowNav, flexShrink: 0 }))

/** Shows one of two icons by mode, through a mode var (no JS, no hydration diff). */
export const ModeIcon = el
  .config({ name: 'SiteModeIcon' })
  .attrs({ tag: 'span', contentAlignX: 'center', contentAlignY: 'center' })
  .states((_t, m) => ({
    dark: { display: m('none', 'flex') },
    light: { display: m('flex', 'none') },
  }))

export const Crumbs = el
  .config({ name: 'SiteCrumbs' })
  .attrs({ tag: 'nav', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme((_t, m) => ({
    ...hideBelowNav,
    flexShrink: 0,
    paddingLeft: 18,
    borderLeft: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.mono,
    fontSize: 11.5,
    color: tone(m, 'fog'),
  }))

export const CrumbLink = el
  .config({ name: 'SiteCrumbLink' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    color: tone(m, 'fog'),
    textDecoration: 'none',
    borderRadius: 4,
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
  }))

export const CrumbCurrent = txt
  .config({ name: 'SiteCrumbCurrent' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ color: tone(m, 'text') }))

/** Round icon link (GitHub, Discord). */
export const IconLink = el
  .config({ name: 'SiteIconLink' })
  .attrs<LinkAttrs>({ tag: 'a', contentAlignX: 'center', contentAlignY: 'center' })
  .theme((_t, m) => ({
    ...hideBelowNav,
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: radius.pill,
    color: tone(m, 'mist'),
    transition: `color ${motion.hover}`,
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
  }))

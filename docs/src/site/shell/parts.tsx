import { font, radius, text, weight, z } from '../theme'
import { el, focusRing, tone, txt, type LinkAttrs } from '../kit/bases'

/**
 * Server-rendered pieces of the marketing shell (skip link, the footer's
 * mark). The nav bar is an island with its own plain markup (SiteNav.tsx).
 */

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


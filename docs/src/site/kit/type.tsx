import type { VNodeChild } from '@pyreon/core'
import { clampSize, display, font, text, weight } from '../theme'
import { el, tone, txt } from './bases'
import { parseInline } from './inline'

/** `.label` — mono, uppercase, tracked eyebrow. state: default | accent. */
export const Eyebrow = txt
  .config({ name: 'Eyebrow' })
  .attrs({ tag: 'div' })
  .theme((_t, m) => ({
    fontFamily: font.mono,
    fontSize: text.eyebrow.size,
    letterSpacing: text.eyebrow.tracking,
    fontWeight: text.eyebrow.weight,
    textTransform: 'uppercase',
    lineHeight: 1.5,
    color: tone(m, 'fog'),
  }))
  .states((_t, m) => ({ default: {}, accent: { color: tone(m, 'accent') } }))

/** Display headings. size: hero | section | landingSection | end | card | step. Set the level with `tag`. */
export const Heading = txt
  .config({ name: 'Heading' })
  .attrs({ tag: 'h2' })
  .theme((_t, m) => ({
    fontFamily: font.sans,
    fontWeight: weight.medium,
    color: tone(m, 'text'),
    margin: 0,
    textWrap: 'balance',
    overflowWrap: 'break-word',
  }))
  .sizes(() => ({
    hero: {
      fontSize: clampSize(display.hero),
      lineHeight: display.hero.lineHeight,
      letterSpacing: display.hero.tracking,
      marginTop: 30,
      marginBottom: 24,
    },
    section: {
      fontSize: clampSize(display.section),
      lineHeight: display.section.lineHeight,
      letterSpacing: display.section.tracking,
      marginTop: 22,
      marginBottom: 24,
    },
    landingSection: {
      fontSize: clampSize(display.landingSection),
      lineHeight: display.landingSection.lineHeight,
      letterSpacing: display.landingSection.tracking,
      marginTop: 22,
      marginBottom: 24,
    },
    end: {
      fontSize: clampSize(display.end),
      lineHeight: display.end.lineHeight,
      letterSpacing: display.end.tracking,
      marginBottom: 30,
    },
    card: {
      fontSize: text.card.size,
      lineHeight: text.card.lineHeight,
      letterSpacing: text.card.tracking,
      marginTop: 4,
    },
    step: {
      fontSize: text.step.size,
      lineHeight: text.step.lineHeight,
      letterSpacing: text.step.tracking,
      marginTop: 14,
      marginBottom: 8,
    },
  }))

/** Body copy: `.lede`, `.head p`, `.card p`. size: hero | section | card | small. */
export const Lede = txt
  .config({ name: 'Lede' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    fontFamily: font.sans,
    color: tone(m, 'mist'),
    fontWeight: weight.regular,
    margin: 0,
  }))
  .sizes(() => ({
    hero: { fontSize: text.ledeHero.size, lineHeight: text.ledeHero.lineHeight, maxWidth: 640, marginBottom: 34 },
    section: { fontSize: text.ledeSection.size, lineHeight: text.ledeSection.lineHeight, maxWidth: 640 },
    card: { fontSize: text.body.size, lineHeight: text.body.lineHeight },
    small: { fontSize: text.small.size, lineHeight: text.small.lineHeight },
  }))

/** Inline code inside copy. */
export const Code = txt
  .config({ name: 'Code' })
  .attrs({ tag: 'code' })
  .theme((_t, m) => ({
    fontFamily: font.mono,
    fontSize: '0.92em',
    color: tone(m, 'text'),
    backgroundColor: 'transparent',
    padding: 0,
    border: 'none',
    overflowWrap: 'anywhere',
  }))

/** 8px status dot. state: ok | warn | err. */
export const StatusDot = el
  .config({ name: 'StatusDot' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme(() => ({
    width: 8,
    height: 8,
    borderRadius: 9999,
    display: 'inline-block',
    marginRight: 8,
    verticalAlign: '1px',
    flexShrink: 0,
  }))
  .states((_t, m) => ({
    ok: { backgroundColor: tone(m, 'ok') },
    warn: { backgroundColor: tone(m, 'warn') },
    err: { backgroundColor: tone(m, 'err') },
  }))

/** `<small>` line under a fact value. */
export const FactNote = txt
  .config({ name: 'FactNote' })
  .attrs({ tag: 'small' })
  .theme((_t, m) => ({
    display: 'block',
    color: tone(m, 'fog'),
    fontSize: text.caption.size,
    lineHeight: text.caption.lineHeight,
    marginTop: 4,
  }))

/**
 * Render a content string's inline grammar (`code`, {dot:…}, <small>) as
 * kit nodes. Never sets innerHTML: content is text.
 */
export function renderInline(source: string): VNodeChild[] {
  return parseInline(source).map((tok) => {
    switch (tok.kind) {
      case 'code':
        return <Code>{tok.value}</Code>
      case 'dot':
        return <StatusDot state={tok.tone} />
      case 'dotColor':
        return <StatusDot style={`background-color:${tok.color}`} />
      case 'small':
        return <FactNote>{tok.value}</FactNote>
      default:
        return tok.value
    }
  })
}

/** Text for assistive technology only. */
export const VisuallyHidden = txt
  .config({ name: 'VisuallyHidden' })
  .attrs({ tag: 'span' })
  .theme(() => ({
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    extendCss: 'clip: rect(0 0 0 0); clip-path: inset(50%); margin: -1px; padding: 0; border: 0;',
  }))

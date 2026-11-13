import { For } from '@pyreon/core'
import type { ExtraSection } from '../content/model'
import { font, radius, text } from '../theme'
import { el, tone, txt } from './bases'
import { GlowCard } from './cards'
import { InstallCommand, Pill } from './controls'
import { TextLink } from './proof'
import { Eyebrow, Heading, Lede, renderInline, StatusBadge } from './type'

/**
 * Pieces for the typed extra sections (`content/extra-sections.ts`) beyond
 * the template's original three kinds: package cards that carry a command, a
 * link or the ember ring, and the one-card `callout` that points at a
 * companion product.
 */

type PackageItem = Extract<ExtraSection, { kind: 'packages' }>['items'][number]
type Callout = Extract<ExtraSection, { kind: 'callout' }>

const PkgName = txt
  .config({ name: 'ExtraPackageName' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: 11.5, color: tone(m, 'accentText'), overflowWrap: 'anywhere' }))

const BigPkgName = txt
  .config({ name: 'ExtraPackageNameLarge' })
  .attrs({ tag: 'h3' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: 20, fontWeight: 500, color: tone(m, 'text'), overflowWrap: 'anywhere' }))

/** `.p-inside` card, extended: `hot` rings it, `command` adds an install line, `link` a product link. */
export function ExtraPackageCard(props: { item: PackageItem }) {
  const i = props.item
  if (i.command) {
    // The "which package do I need" shape: the package is the heading.
    return (
      <GlowCard state={i.hot ? 'hot' : 'default'}>
        <Eyebrow state={i.hot ? 'accent' : 'default'}>{i.role}</Eyebrow>
        <BigPkgName>{i.pkg}</BigPkgName>
        <Lede size="small">{renderInline(i.text)}</Lede>
        <InstallCommand command={i.command} />
      </GlowCard>
    )
  }
  return (
    <GlowCard padding="compact" state={i.hot ? 'hot' : 'default'}>
      <PkgName>{i.pkg}</PkgName>
      <Eyebrow>{i.role}</Eyebrow>
      <Lede size="small">{renderInline(i.text)}</Lede>
      {i.link ? <TextLink href={i.link.href}>{i.link.label}</TextLink> : null}
    </GlowCard>
  )
}

const CalloutGrid = el
  .config({ name: 'ExtraCallout' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.2fr) minmax(0, 1fr)' },
    gap: 28,
    alignItems: 'center',
  }))

const CalloutLinks = el.config({ name: 'ExtraCalloutLinks' }).attrs({ block: true, gap: 8 }).theme(() => ({ extendCss: '& > a { justify-content: center; white-space: normal; text-align: center; }' }))

const CalloutText = txt
  .config({ name: 'ExtraCalloutText' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, marginTop: 10, fontSize: text.body.size, lineHeight: text.body.lineHeight, color: tone(m, 'mist') }))

/** `primitives` → "pairs with Design System": one ember card, text left, links right. */
export function ExtraCallout(props: { section: Callout }) {
  const s = props.section
  return (
    <GlowCard state="hot">
      <CalloutGrid>
        <div>
          <Eyebrow state="accent">{s.label}</Eyebrow>
          <Heading tag="h2" size="card">
            {s.title}
          </Heading>
          <CalloutText>{renderInline(s.text)}</CalloutText>
        </div>
        <CalloutLinks>
          <For each={s.links} by={(l) => l.href}>
            {(l) => (
              <Pill href={l.href} size="lg" variant={l.solid ? 'solid' : 'ghost'}>
                {l.label}
              </Pill>
            )}
          </For>
        </CalloutLinks>
      </CalloutGrid>
    </GlowCard>
  )
}

const NoteBox = el
  .config({ name: 'NextReleaseNote' })
  .attrs({ tag: 'p', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({
    margin: 0,
    minHeight: 50,
    maxWidth: '100%',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 18,
    paddingRight: 18,
    border: '1px dashed',
    borderColor: tone(m, 'line2'),
    borderRadius: radius.pill,
    fontFamily: font.mono,
    fontSize: text.mono.size + 1,
    lineHeight: 1.45,
    color: tone(m, 'mist'),
  }))

/**
 * Stands in for the install command on a product that is not on npm yet
 * (its content file's `hero.install` is a `#` comment): a status note, with
 * nothing to copy, so the page never implies it can be installed today.
 */
export function NextReleaseNote(props: { text: string }) {
  return (
    <NoteBox>
      <StatusBadge>next release</StatusBadge>
      <span>{props.text.replace(/^\s*#\s*/, '')}</span>
    </NoteBox>
  )
}

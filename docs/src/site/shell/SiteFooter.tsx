import { For } from '@pyreon/core'
import { font, text, weight } from '../theme'
import { el, focusRing, tone, txt, type LinkAttrs } from '../kit/bases'
import { Glyph } from '../kit/cards'
import { InstallCommand } from '../kit/controls'
import { isFileHref, useLinkClick } from '../kit/link'
import { Wrap } from '../kit/layout'
import { FOOTER } from '../nav'
import { MarkLink, Wordmark } from './parts'

const FooterRoot = el
  .config({ name: 'SiteFooter' })
  .attrs({ tag: 'footer', block: true })
  .theme((_t, m) => ({
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
    paddingTop: 56,
    paddingBottom: 40,
  }))

const Grid = el
  .config({ name: 'SiteFooterGrid' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    gridTemplateColumns: {
      xs: 'repeat(2, minmax(0, 1fr))',
      md: 'repeat(3, minmax(0, 1fr))',
      xl: 'minmax(0, 2fr) repeat(5, minmax(0, 1fr))',
    },
    gap: 36,
  }))

const Intro = el
  .config({ name: 'SiteFooterIntro' })
  .attrs({ block: true, contentAlignX: 'left', contentAlignY: 'top' })
  .theme(() => ({ gridColumn: { xs: '1 / -1', xl: 'auto' } }))

const Blurb = txt
  .config({ name: 'SiteFooterBlurb' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    marginTop: 16,
    marginBottom: 20,
    maxWidth: 320,
    fontFamily: font.sans,
    fontSize: 14,
    lineHeight: 1.6,
    color: tone(m, 'fog'),
  }))

const ColumnTitle = txt
  .config({ name: 'SiteFooterTitle' })
  .attrs({ tag: 'h2' })
  .theme((_t, m) => ({
    margin: 0,
    marginBottom: 16,
    fontFamily: font.mono,
    fontSize: text.eyebrowTight.size,
    fontWeight: weight.medium,
    letterSpacing: text.eyebrowTight.tracking,
    textTransform: 'uppercase',
    color: tone(m, 'fog'),
  }))

const Links = el
  .config({ name: 'SiteFooterLinks' })
  .attrs({ tag: 'ul', block: true, gap: 10 })
  .theme(() => ({ listStyle: 'none', margin: 0, padding: 0 }))

const FooterLink = el
  .config({ name: 'SiteFooterLink' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    fontFamily: font.sans,
    fontSize: 14,
    color: tone(m, 'mist'),
    textDecoration: 'none',
    borderRadius: 4,
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
  }))

const Bottom = el
  .config({ name: 'SiteFooterBottom' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', gap: 12 })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    marginTop: 52,
    fontFamily: font.sans,
    fontSize: text.caption.size,
    color: tone(m, 'fog'),
  }))

/** Site footer (`_nav.json` → `footer`): mark, tagline, install, five link columns, licence line. */
export function SiteFooter() {
  const click = useLinkClick()
  return (
    <FooterRoot id="site-footer">
      <Wrap>
        <Grid>
          <Intro>
            <MarkLink href="/" aria-label="Pyreon home" onClick={click('/')}>
              <Glyph id="pyreon" size={24} />
              <Wordmark>pyreon</Wordmark>
            </MarkLink>
            <Blurb>{FOOTER.tagline}</Blurb>
            <InstallCommand command={FOOTER.install} />
          </Intro>
          <For each={FOOTER.columns} by={(c) => c.title}>
            {(col) => {
              const id = `site-footer-${col.title.toLowerCase()}`
              return (
                <nav aria-labelledby={id}>
                  <ColumnTitle id={id}>{col.title}</ColumnTitle>
                  <Links>
                    <For each={col.links} by={(l) => l.href}>
                      {(l) => (
                        <li>
                          <FooterLink
                            href={l.href}
                            data-allow-reload={isFileHref(l.href) ? '' : undefined}
                            onClick={click(l.href)}
                          >
                            {l.label}
                          </FooterLink>
                        </li>
                      )}
                    </For>
                  </Links>
                </nav>
              )
            }}
          </For>
        </Grid>
        <Bottom>
          <span>{FOOTER.bottom.left}</span>
          <span>{FOOTER.bottom.right}</span>
        </Bottom>
      </Wrap>
    </FooterRoot>
  )
}

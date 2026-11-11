import { For } from '@pyreon/core'
import { useRoute } from '@pyreon/router'
import { el, focusRing, tone, txt, type LinkAttrs } from '../kit/bases'
import { InstallCommand } from '../kit/controls'
import { isFileHref, useLinkClick } from '../kit/link'
import { isCurrent, MEGA_COLUMNS, MOBILE, WHY_MENU } from '../nav'
import { font, layout, navMedia, radius, text, weight, z } from '../theme'

const Sheet = el
  .config({ name: 'MobileSheet' })
  // contentAlignY 'top': Element centres content by default, and a centred
  // column taller than the screen overflows upwards where it cannot scroll.
  .attrs({ tag: 'nav', block: true, contentAlignX: 'block', contentAlignY: 'top' })
  .theme((_t, m) => ({
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: z.sheet,
    pointerEvents: 'auto',
    overflowY: 'auto',
    paddingTop: layout.sheetPadTop,
    paddingBottom: 40,
    paddingLeft: 20,
    paddingRight: 20,
    backgroundColor: tone(m, 'bg'),
    extendCss: `
      overscroll-behavior: contain;
      &[hidden] { display: none; }
      ${navMedia.expanded} { display: none; }
    `,
  }))

const PlainList = el
  .config({ name: 'MobileSheetList' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({ listStyle: 'none', margin: 0, padding: 0 }))

const BigLink = el
  .config({ name: 'MobileSheetLink' })
  .attrs<LinkAttrs>({ tag: 'a', block: true })
  .theme((_t, m) => ({
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: font.sans,
    fontSize: text.sheetLink.size,
    letterSpacing: '-.02em',
    color: tone(m, 'text'),
    textDecoration: 'none',
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    focus: { ...focusRing(m), outlineOffset: '-2px', borderRadius: radius.small },
  }))

const GroupTitle = txt
  .config({ name: 'MobileSheetTitle' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    marginTop: 26,
    marginBottom: 8,
    fontFamily: font.mono,
    fontSize: text.eyebrowTight.size,
    letterSpacing: text.eyebrowTight.tracking,
    fontWeight: weight.medium,
    textTransform: 'uppercase',
    color: tone(m, 'fog'),
  }))

const Grid = el
  .config({ name: 'MobileSheetGrid' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0 14px',
  }))

const SmallLink = el
  .config({ name: 'MobileSheetSmallLink' })
  .attrs<LinkAttrs>({ tag: 'a', block: true })
  .theme((_t, m) => ({
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: font.sans,
    fontSize: text.small.size,
    color: tone(m, 'mist'),
    textDecoration: 'none',
    overflowWrap: 'anywhere',
    focus: { ...focusRing(m), borderRadius: radius.small },
  }))
  .states((_t, m) => ({ default: {}, current: { color: tone(m, 'text') } }))

const Install = el.config({ name: 'MobileSheetInstall' }).attrs({ block: true }).theme(() => ({ marginTop: 28 }))

const FooterRow = el
  .config({ name: 'MobileSheetFooter' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: 20 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, marginTop: 20, padding: 0 }))

/**
 * The full-screen menu below 960px (`_nav.json` → `mobile`): big links, the
 * Why and Compare lists, every product grouped like the mega menu, the
 * install command and the community links. A `<nav>` disclosed by the menu
 * button; SiteHeader owns opening, focus (moved to the first link on open,
 * trapped in the header while open, returned to the button on Escape), the
 * scroll lock and making the page behind it inert.
 */
export function MobileSheet(props: { id: string; open: () => boolean; onNavigate: () => void }) {
  const click = useLinkClick()
  const route = useRoute()
  const path = () => route().path
  const groupId = (s: string) => `${props.id}-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const groups = [{ label: WHY_MENU.label, items: WHY_MENU.items }, ...WHY_MENU.groups.slice(0, 1)]
  return (
    <Sheet id={props.id} aria-label="Menu" hidden={!props.open()} data-testid="mobile-sheet">
      <PlainList>
        <For each={MOBILE.big} by={(l) => l.href}>
          {(l) => (
            <li>
              <BigLink href={l.href} aria-current={path() === l.href ? 'page' : undefined} onClick={click(l.href, props.onNavigate)}>
                {l.label}
              </BigLink>
            </li>
          )}
        </For>
      </PlainList>

      <For each={groups} by={(g) => g.label}>
        {(g) => (
          <>
            <GroupTitle id={groupId(g.label)}>{g.label}</GroupTitle>
            <Grid aria-labelledby={groupId(g.label)}>
              <For each={g.items} by={(l) => l.href}>
                {(l) => (
                  <li>
                    <SmallLink href={l.href} onClick={click(l.href, props.onNavigate)}>
                      {l.label}
                    </SmallLink>
                  </li>
                )}
              </For>
            </Grid>
          </>
        )}
      </For>

      <For each={MEGA_COLUMNS} by={(c) => c.id}>
        {(col) => (
          <>
            <GroupTitle id={groupId(`products-${col.id}`)}>{col.title}</GroupTitle>
            <Grid aria-labelledby={groupId(`products-${col.id}`)}>
              <For each={col.items} by={(p) => p.id}>
                {(p) => (
                  <li>
                    <SmallLink
                      href={p.href}
                      state={isCurrent(path(), p.href) ? 'current' : 'default'}
                      aria-current={isCurrent(path(), p.href) ? 'page' : undefined}
                      onClick={click(p.href, props.onNavigate)}
                    >
                      {p.name}
                    </SmallLink>
                  </li>
                )}
              </For>
            </Grid>
          </>
        )}
      </For>

      <Install>
        <InstallCommand command={MOBILE.install} />
      </Install>
      <FooterRow aria-label="Community">
        <For each={MOBILE.footer} by={(l) => l.href}>
          {(l) => (
            <li>
              <SmallLink href={l.href} data-allow-reload={isFileHref(l.href) ? '' : undefined} onClick={click(l.href, props.onNavigate)}>
                {l.label}
              </SmallLink>
            </li>
          )}
        </For>
      </FooterRow>
    </Sheet>
  )
}

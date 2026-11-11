import { For, Show } from '@pyreon/core'
import { keyframes } from '@pyreon/styler'
import { el, focusRing, tone, txt, type LinkAttrs } from '../kit/bases'
import { Glyph } from '../kit/cards'
import { useLinkClick } from '../kit/link'
import { MEGA_COLUMNS, MEGA_FOOTER, WHY_MENU } from '../nav'
import { font, motion, radius, text, weight, z } from '../theme'

const panelIn = keyframes`
  from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
  to { opacity: 1; transform: translateX(-50%); }
`

const Panel = el
  .config({ name: 'NavPanel' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    position: 'absolute',
    top: 62,
    left: '50%',
    zIndex: z.panel,
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100vh - 100px)',
    overflowY: 'auto',
    padding: 20,
    borderRadius: radius.panel,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    backgroundColor: tone(m, 'panel'),
    boxShadow: tone(m, 'shadow'),
    transform: 'translateX(-50%)',
    extendCss: `
      animation: ${panelIn} ${motion.panel} both;
      &[hidden] { display: none; }
      @media (prefers-reduced-motion: reduce) { animation: none; }
    `,
  }))
  .sizes(() => ({ wide: { width: 1000 }, narrow: { width: 620 } }))

const Columns = el
  .config({ name: 'NavPanelColumns' })
  .attrs({ block: true })
  .theme(() => ({ display: 'grid', gap: '6px 14px' }))
  .sizes(() => ({
    four: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
    two: { gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' },
  }))

const ColumnTitle = txt
  .config({ name: 'NavPanelTitle' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    marginBottom: 6,
    paddingLeft: 8,
    fontFamily: font.mono,
    fontSize: text.eyebrowTight.size,
    letterSpacing: text.eyebrowTight.tracking,
    fontWeight: weight.medium,
    textTransform: 'uppercase',
    color: tone(m, 'fog'),
  }))

const List = el
  .config({ name: 'NavPanelList' })
  .attrs({ tag: 'ul', block: true, gap: 2 })
  .theme(() => ({ listStyle: 'none', margin: 0, padding: 0 }))

const ItemLink = el
  .config({ name: 'NavPanelItem' })
  .attrs<LinkAttrs>({ tag: 'a', block: true, contentDirection: 'inline', contentAlignY: 'top', gap: 8 })
  .theme((_t, m) => ({
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: radius.control,
    textDecoration: 'none',
    color: tone(m, 'text'),
    hover: { backgroundColor: tone(m, 'hoverFill') },
    focus: { ...focusRing(m), outlineOffset: '0px', backgroundColor: tone(m, 'hoverFill') },
  }))

const ItemName = txt
  .config({ name: 'NavPanelItemName' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    display: 'block',
    fontFamily: font.sans,
    fontSize: text.navLink.size,
    fontWeight: weight.medium,
    color: tone(m, 'text'),
  }))

const ItemSub = txt
  .config({ name: 'NavPanelItemSub' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    display: 'block',
    marginTop: 2,
    fontFamily: font.sans,
    fontSize: text.mono.size,
    lineHeight: 1.4,
    color: tone(m, 'fog'),
  }))

const Badge = txt
  .config({ name: 'NavPanelBadge' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    marginLeft: 6,
    paddingLeft: 6,
    paddingRight: 6,
    borderRadius: radius.pill,
    border: '1px solid',
    fontFamily: font.mono,
    fontSize: 9.5,
    fontWeight: weight.medium,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    verticalAlign: '1px',
    color: tone(m, 'warn'),
    borderColor: tone(m, 'warn'),
  }))

const GlyphBox = el
  .config({ name: 'NavPanelGlyph' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ flexShrink: 0, marginTop: 2, color: tone(m, 'text') }))

const PanelFooter = el
  .config({ name: 'NavPanelFooter' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: 20 })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    listStyle: 'none',
    margin: 0,
    marginTop: 14,
    paddingTop: 14,
    paddingLeft: 8,
    paddingBottom: 0,
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
  }))

const FooterLink = el
  .config({ name: 'NavPanelFooterLink' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    fontFamily: font.sans,
    fontSize: 13,
    color: tone(m, 'mist'),
    textDecoration: 'none',
    borderRadius: 4,
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
  }))

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/**
 * The Products panel: the four `_nav.json` columns (all 40 products) and the
 * panel footer. It is the content of a disclosure button (`aria-expanded` +
 * `aria-controls`), not an ARIA menu: the links stay ordinary links in the
 * tab order right after the button (WAI-ARIA APG "disclosure navigation").
 * Open/close is owned by SiteHeader.
 */
export function ProductsPanel(props: { id: string; open: () => boolean; onNavigate: () => void }) {
  const click = useLinkClick()
  return (
    <Panel id={props.id} size="wide" hidden={!props.open()} data-testid="mega-menu">
      <Columns size="four">
        <For each={MEGA_COLUMNS} by={(c) => c.id}>
          {(col) => {
            const headingId = `${props.id}-${col.id}`
            return (
              <div>
                <ColumnTitle id={headingId}>{col.title}</ColumnTitle>
                <List aria-labelledby={headingId}>
                  <For each={col.items} by={(i) => i.id}>
                    {(item) => (
                      <li>
                        <ItemLink href={item.href} onClick={click(item.href, props.onNavigate)}>
                          <GlyphBox>
                            <Glyph id={item.id} size={20} />
                          </GlyphBox>
                          <span>
                            <ItemName>
                              {item.name}
                              <Show when={() => item.badge !== undefined}>
                                <Badge>{item.badge}</Badge>
                              </Show>
                            </ItemName>
                            <ItemSub>{item.sub}</ItemSub>
                          </span>
                        </ItemLink>
                      </li>
                    )}
                  </For>
                </List>
              </div>
            )
          }}
        </For>
      </Columns>
      <PanelFooter>
        <For each={MEGA_FOOTER} by={(l) => l.href}>
          {(l) => (
            <li>
              <FooterLink href={l.href} onClick={click(l.href, props.onNavigate)}>
                {`${l.label} →`}
              </FooterLink>
            </li>
          )}
        </For>
      </PanelFooter>
    </Panel>
  )
}

/** The "Why Pyreon" panel: the five reasons, then Compare and Migrate. */
export function WhyPanel(props: { id: string; open: () => boolean; onNavigate: () => void }) {
  const click = useLinkClick()
  const itemsId = `${props.id}-items`
  return (
    <Panel id={props.id} size="narrow" hidden={!props.open()} data-testid="why-menu">
      <Columns size="two">
        <div>
          <ColumnTitle id={itemsId}>{WHY_MENU.label}</ColumnTitle>
          <List aria-labelledby={itemsId}>
            <For each={WHY_MENU.items} by={(i) => i.href}>
              {(item) => (
                <li>
                  <ItemLink href={item.href} onClick={click(item.href, props.onNavigate)}>
                    <span>
                      <ItemName>{item.label}</ItemName>
                      <ItemSub>{item.sub ?? ''}</ItemSub>
                    </span>
                  </ItemLink>
                </li>
              )}
            </For>
          </List>
        </div>
        <div>
          <For each={WHY_MENU.groups} by={(g) => g.label}>
            {(group) => {
              const headingId = `${props.id}-${slug(group.label)}`
              return (
                <div>
                  <ColumnTitle id={headingId}>{group.label}</ColumnTitle>
                  <List aria-labelledby={headingId}>
                    <For each={group.items} by={(i) => i.href}>
                      {(item) => (
                        <li>
                          <ItemLink href={item.href} onClick={click(item.href, props.onNavigate)}>
                            <ItemName>{item.label}</ItemName>
                          </ItemLink>
                        </li>
                      )}
                    </For>
                  </List>
                </div>
              )
            }}
          </For>
        </div>
      </Columns>
    </Panel>
  )
}

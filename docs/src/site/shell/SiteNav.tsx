import { For, onUnmount, Show } from '@pyreon/core'
import { useClickOutside, useEventListener, useFocusTrap, useMediaQuery, useScrollLock } from '@pyreon/hooks'
import { isServer, signal, watch } from '@pyreon/reactivity'
import { colorMode, toggleColorMode } from '../color-mode'
import { C } from '../kit/classes'
import { InlineCommand } from '../kit/command'
import { Glyph } from '../kit/glyph'
import { isFileHref } from '../kit/href'
import {
  BAR_LINKS,
  ICON_LINKS,
  isCurrent,
  MEGA_COLUMNS,
  MEGA_FOOTER,
  MOBILE,
  PRODUCTS_LABEL,
  productIdOf,
  productName,
  START,
  THEME_LABEL,
  WHY_MENU,
} from '../nav'
import { navMedia } from '../theme'

const PRODUCTS_ID = 'site-products-menu'
const WHY_ID = 'site-why-menu'
const SHEET_ID = 'site-sheet'

/** Elements behind the open sheet that must leave the tab order / AT tree. */
const BEHIND_SHEET = '#site-main, #site-footer'

type MenuId = 'products' | 'why'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

const Chevron = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
)

const GithubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
    />
  </svg>
)

const DiscordIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M13.55 3.02A13.2 13.2 0 0 0 10.3 2l-.16.32a12.2 12.2 0 0 1 2.88 1.04 11.1 11.1 0 0 0-10.04 0A12.2 12.2 0 0 1 5.86 2.32L5.7 2a13.2 13.2 0 0 0-3.25 1.02C.4 6.06-.16 9.02.12 11.94A13.3 13.3 0 0 0 4.1 14l.85-1.17a8.6 8.6 0 0 1-1.34-.65l.33-.25a9.4 9.4 0 0 0 8.12 0l.33.25c-.43.25-.88.47-1.34.65L11.9 14a13.3 13.3 0 0 0 3.98-2.06c.33-3.38-.56-6.31-2.33-8.92ZM5.35 10.15c-.79 0-1.43-.72-1.43-1.6 0-.89.63-1.61 1.43-1.61s1.44.72 1.43 1.6c0 .89-.63 1.61-1.43 1.61Zm5.3 0c-.79 0-1.43-.72-1.43-1.6 0-.89.63-1.61 1.43-1.61s1.44.72 1.43 1.6c0 .89-.63 1.61-1.43 1.61Z"
    />
  </svg>
)

/** The Products panel: the four `_nav.json` columns (all 40 products) and the footer row. */
function ProductsPanel(props: { onNavigate: () => void }) {
  return (
    <div id={PRODUCTS_ID} class={`${C.panel} ${C.panelWide}`} data-testid="mega-menu">
      <div class={C.columns4}>
        <For each={MEGA_COLUMNS} by={(c) => c.id}>
          {(col) => (
            <div>
              <p class={C.colTitle} id={`${PRODUCTS_ID}-${col.id}`}>
                {col.title}
              </p>
              <ul class={C.list} aria-labelledby={`${PRODUCTS_ID}-${col.id}`}>
                <For each={col.items} by={(i) => i.id}>
                  {(item) => (
                    <li>
                      <a class={C.item} href={item.href} onClick={props.onNavigate}>
                        <Glyph id={item.id} size={20} />
                        <span>
                          <span class={C.itemName}>
                            {item.name}
                            {item.badge !== undefined ? <span class={C.badge}>{item.badge}</span> : null}
                          </span>
                          <span class={C.itemSub}>{item.sub}</span>
                        </span>
                      </a>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
      </div>
      <ul class={C.panelFoot}>
        <For each={MEGA_FOOTER} by={(l) => l.href}>
          {(l) => (
            <li>
              <a href={l.href} onClick={props.onNavigate}>{`${l.label} →`}</a>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}

/** The "Why Pyreon" panel: the five reasons, then Compare and Migrate. */
function WhyPanel(props: { onNavigate: () => void }) {
  const itemsId = `${WHY_ID}-items`
  return (
    <div id={WHY_ID} class={`${C.panel} ${C.panelNarrow}`} data-testid="why-menu">
      <div class={C.columns2}>
        <div>
          <p class={C.colTitle} id={itemsId}>
            {WHY_MENU.label}
          </p>
          <ul class={C.list} aria-labelledby={itemsId}>
            <For each={WHY_MENU.items} by={(i) => i.href}>
              {(item) => (
                <li>
                  <a class={C.item} href={item.href} onClick={props.onNavigate}>
                    <span>
                      <span class={C.itemName}>{item.label}</span>
                      <span class={C.itemSub}>{item.sub ?? ''}</span>
                    </span>
                  </a>
                </li>
              )}
            </For>
          </ul>
        </div>
        <div>
          <For each={WHY_MENU.groups} by={(g) => g.label}>
            {(group) => (
              <div>
                <p class={C.colTitle} id={`${WHY_ID}-${slug(group.label)}`}>
                  {group.label}
                </p>
                <ul class={C.list} aria-labelledby={`${WHY_ID}-${slug(group.label)}`}>
                  <For each={group.items} by={(i) => i.href}>
                    {(item) => (
                      <li>
                        <a class={C.item} href={item.href} onClick={props.onNavigate}>
                          <span class={C.itemName}>{item.label}</span>
                        </a>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}

/**
 * The full-screen menu below 960px (`_nav.json` → `mobile`): big links, the
 * Why and Compare lists, every product grouped like the mega menu, the install
 * command and the community links.
 */
function MobileSheet(props: { path: string; onNavigate: () => void }) {
  const groups = [{ label: WHY_MENU.label, items: WHY_MENU.items }, ...WHY_MENU.groups.slice(0, 1)]
  const groupId = (s: string) => `${SHEET_ID}-${slug(s)}`
  return (
    <nav id={SHEET_ID} class={C.sheet} aria-label="Menu" data-testid="mobile-sheet">
      <ul class={C.sheetList}>
        <For each={MOBILE.big} by={(l) => l.href}>
          {(l) => (
            <li>
              <a class={C.bigLink} href={l.href} aria-current={props.path === l.href ? 'page' : undefined} onClick={props.onNavigate}>
                {l.label}
              </a>
            </li>
          )}
        </For>
      </ul>
      <For each={groups} by={(g) => g.label}>
        {(g) => (
          <>
            <p class={C.groupTitle} id={groupId(g.label)}>
              {g.label}
            </p>
            <ul class={C.sheetGrid} aria-labelledby={groupId(g.label)}>
              <For each={g.items} by={(l) => l.href}>
                {(l) => (
                  <li>
                    <a class={C.smallLink} href={l.href} onClick={props.onNavigate}>
                      {l.label}
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </>
        )}
      </For>
      <For each={MEGA_COLUMNS} by={(c) => c.id}>
        {(col) => (
          <>
            <p class={C.groupTitle} id={groupId(`products-${col.id}`)}>
              {col.title}
            </p>
            <ul class={C.sheetGrid} aria-labelledby={groupId(`products-${col.id}`)}>
              <For each={col.items} by={(p) => p.id}>
                {(p) => (
                  <li>
                    <a
                      class={C.smallLink}
                      href={p.href}
                      aria-current={isCurrent(props.path, p.href) ? 'page' : undefined}
                      onClick={props.onNavigate}
                    >
                      {p.name}
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </>
        )}
      </For>
      <div class={C.sheetInstall}>
        <InlineCommand command={MOBILE.install} />
      </div>
      <ul class={C.sheetFoot} aria-label="Community">
        <For each={MOBILE.footer} by={(l) => l.href}>
          {(l) => (
            <li>
              <a class={C.smallLink} href={l.href} data-allow-reload={isFileHref(l.href) ? '' : undefined} onClick={props.onNavigate}>
                {l.label}
              </a>
            </li>
          )}
        </For>
      </ul>
    </nav>
  )
}

/**
 * The floating nav bar (`_nav.json`), an island: mark · [crumbs on product
 * pages] · Products (mega menu) · Why Pyreon (menu) · links · GitHub · theme ·
 * primary pill · menu button (below 960px).
 *
 * Plain markup styled by `kit/site-css.ts`: the island ships the nav's data
 * and behaviour, not a styling runtime. `path` is the page's path, passed by
 * the server render (the island has no router on a static page).
 *
 * Both menus are disclosures (WAI-ARIA APG "disclosure navigation"): a button
 * with `aria-expanded` + `aria-controls`, its links ordinary links in the tab
 * order. One is open at a time; Escape closes it and returns focus to its
 * button, as do a click outside, focus leaving the nav and any link inside.
 * The panels render only while open.
 *
 * The mobile sheet is a disclosure too, by decision (not a `role=dialog`):
 * the close control is the same menu button in the bar, which stays visible
 * above the sheet; an `aria-modal` dialog would hide that button from screen
 * readers. Modality comes from the page instead: while the sheet is open the
 * page behind it is `inert`, Tab stays in the header (bar + sheet), scrolling
 * is locked, Escape closes it and returns focus to the menu button, and
 * widening past 960px closes it.
 */
export default function SiteNav(props: { path: string }) {
  const path = props.path
  const productId = productIdOf(path)
  const openMenu = signal<MenuId | null>(null)
  const sheetOpen = signal(false)

  let headerEl: HTMLElement | null = null
  let navEl: HTMLElement | null = null
  const menuButtons: Record<MenuId, HTMLElement | null> = { products: null, why: null }
  let sheetButton: HTMLElement | null = null

  const closeMenu = (refocus = false) => {
    const open = openMenu.peek()
    if (open === null) return
    openMenu.set(null)
    if (refocus) menuButtons[open]?.focus()
  }
  const toggleMenu = (id: MenuId) => openMenu.set(openMenu.peek() === id ? null : id)

  const scroll = useScrollLock()
  const setBehindInert = (inert: boolean) => {
    if (isServer) return
    for (const node of document.querySelectorAll<HTMLElement>(BEHIND_SHEET)) node.inert = inert
  }
  const closeSheet = (refocus = false) => {
    if (!sheetOpen.peek()) return
    sheetOpen.set(false)
    if (refocus) sheetButton?.focus()
  }

  // The sheet's side effects in one place, so every close path (Escape, link,
  // resize) restores the page the same way.
  watch(sheetOpen, (open) => {
    setBehindInert(open)
    if (open) scroll.lock()
    else scroll.unlock()
  })
  onUnmount(() => {
    setBehindInert(false)
    scroll.unlock()
  })

  useFocusTrap(() => headerEl, { active: () => sheetOpen() })

  const openSheet = () => {
    sheetOpen.set(true)
    // The sheet renders in this same flush; move focus once it can take it
    // (useFocusTrap's initialFocus fires too early for this, #4355).
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`#${SHEET_ID} a`)?.focus())
  }
  useClickOutside(() => navEl, () => closeMenu())

  useEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (openMenu.peek() !== null) {
      e.preventDefault()
      closeMenu(true)
    } else if (sheetOpen.peek()) {
      e.preventDefault()
      closeSheet(true)
    }
  })
  // Crossing the 960px collapse closes whichever navigation is going away.
  const expanded = useMediaQuery(navMedia.expanded.replace('@media ', ''))
  watch(expanded, (wide) => (wide ? closeSheet() : closeMenu()))

  const afterLink = () => {
    closeMenu()
    closeSheet()
  }

  // The sheet is the bar's sibling, not its child: the bar's backdrop-filter
  // makes it the containing block of any fixed descendant.
  return (
    <>
    <div
      class={C.bar}
      ref={(n: HTMLElement | null) => {
        headerEl = n?.closest('header') ?? n
      }}
    >
      <a class={C.mark} href="/" aria-label="Pyreon home" aria-current={path === '/' ? 'page' : undefined}>
        <Glyph id="pyreon" size={24} />
        <span class={C.wordmark}>pyreon</span>
      </a>

      {productId !== undefined ? (
        <>
          <nav class={C.crumbs} aria-label="Breadcrumb">
            <a href="/products">products</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{productName(productId).toLowerCase()}</span>
          </nav>
          <div class={C.spacer} />
        </>
      ) : null}

      <nav
        class={C.nav}
        aria-label="Primary"
        ref={(n: HTMLElement | null) => {
          navEl = n
        }}
        onFocusOut={(e: FocusEvent) => {
          const next = e.relatedTarget as Node | null
          if (next && navEl && !navEl.contains(next)) closeMenu()
        }}
      >
        <button
          type="button"
          class={path.startsWith('/products') ? `${C.navLink} ${C.isCurrent}` : C.navLink}
          ref={(n: HTMLElement | null) => {
            menuButtons.products = n
          }}
          aria-expanded={() => (openMenu() === 'products' ? 'true' : 'false')}
          aria-controls={PRODUCTS_ID}
          onClick={() => toggleMenu('products')}
        >
          {PRODUCTS_LABEL}
          <Chevron />
        </button>
        <Show when={() => openMenu() === 'products'}>
          <ProductsPanel onNavigate={afterLink} />
        </Show>

        <button
          type="button"
          class={C.navLink}
          ref={(n: HTMLElement | null) => {
            menuButtons.why = n
          }}
          aria-expanded={() => (openMenu() === 'why' ? 'true' : 'false')}
          aria-controls={WHY_ID}
          onClick={() => toggleMenu('why')}
        >
          {WHY_MENU.label}
          <Chevron />
        </button>
        <Show when={() => openMenu() === 'why'}>
          <WhyPanel onNavigate={afterLink} />
        </Show>

        <For each={BAR_LINKS} by={(l) => l.href}>
          {(l) => (
            <a class={C.navLink} href={l.href} aria-current={isCurrent(path, l.href) ? 'page' : undefined}>
              {l.label}
            </a>
          )}
        </For>
      </nav>
      {productId === undefined ? <div class={C.spacer} /> : null}

      <For each={ICON_LINKS} by={(l) => l.href}>
        {(l) => (
          <a class={C.iconLink} href={l.href} aria-label={l.label}>
            {l.kind === 'github' ? <GithubIcon /> : <DiscordIcon />}
          </a>
        )}
      </For>

      <button
        type="button"
        class={C.iconButton}
        aria-label="Dark theme"
        aria-pressed={() => (colorMode() === 'dark' ? 'true' : 'false')}
        title={THEME_LABEL}
        onClick={() => toggleColorMode()}
        data-testid="theme-toggle"
      >
        <span class={C.modeDark}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
          </svg>
        </span>
        <span class={C.modeLight}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </span>
      </button>

      <a class={`${C.pill} ${C.pillSolid} ${C.desktopOnly}`} href={productId !== undefined ? '#start' : START.href}>
        {productId !== undefined ? 'Install' : START.label}
      </a>

      <button
        type="button"
        class={C.menuButton}
        ref={(n: HTMLElement | null) => {
          sheetButton = n
        }}
        aria-expanded={() => (sheetOpen() ? 'true' : 'false')}
        aria-controls={SHEET_ID}
        aria-label={() => (sheetOpen() ? MOBILE.close : MOBILE.open)}
        onClick={() => (sheetOpen.peek() ? closeSheet() : openSheet())}
        data-testid="menu-button"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d={() => (sheetOpen() ? 'M3.5 3.5l9 9M12.5 3.5l-9 9' : 'M2 4h12M2 8h12M2 12h12')}
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
    <Show when={() => sheetOpen()}>
      <MobileSheet path={path} onNavigate={afterLink} />
    </Show>
    </>
  )
}

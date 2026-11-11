import { For, onMount, onUnmount, Show } from '@pyreon/core'
import { useClickOutside, useEventListener, useFocusTrap, useMediaQuery, useScrollLock } from '@pyreon/hooks'
import { isServer, signal, watch } from '@pyreon/reactivity'
import { useRoute } from '@pyreon/router'
import { colorMode, toggleColorMode } from '../color-mode'
import { Glyph } from '../kit/cards'
import { Pill } from '../kit/controls'
import { useLinkClick } from '../kit/link'
import { BAR_LINKS, ICON_LINKS, isCurrent, MOBILE, PRODUCTS_LABEL, productIdOf, productName, START, THEME_LABEL, WHY_MENU } from '../nav'
import { navMedia } from '../theme'
import { ProductsPanel, WhyPanel } from './MegaMenu'
import { MobileSheet } from './MobileSheet'
import {
  Bar,
  Crumbs,
  CrumbLink,
  CrumbCurrent,
  DesktopOnly,
  HeaderRoot,
  IconButton,
  IconLink,
  MarkLink,
  MenuButtonBox,
  ModeIcon,
  NavLinkText,
  PrimaryNav,
  Spacer,
  Wordmark,
} from './parts'

const PRODUCTS_ID = 'site-products-menu'
const WHY_ID = 'site-why-menu'
const SHEET_ID = 'site-sheet'

/** Elements behind the open sheet that must leave the tab order / AT tree. */
const BEHIND_SHEET = '#site-main, #site-footer'

type MenuId = 'products' | 'why'

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

/**
 * The floating nav bar (`_nav.json`): mark · [crumbs on product pages] ·
 * Products (mega menu) · Why Pyreon (menu) · links · GitHub · theme · primary
 * pill · menu button (below 960px).
 *
 * The two menus are disclosures: one open at a time; Escape closes and
 * returns focus to its button, as do a click outside, focus leaving the nav,
 * a route change and any link inside. The mobile sheet: focus moves to its
 * first link on open, Tab stays in the header (bar + sheet) while open,
 * Escape closes it and returns focus to the menu button, the page behind is
 * `inert`, scrolling is locked, and widening past 960px closes it.
 */
export function SiteHeader() {
  const route = useRoute()
  const click = useLinkClick()
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

  // The sheet's side effects in one place, so every close path (Escape,
  // link, resize, route change) restores the page the same way.
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
    // The sheet un-hides in this same flush; move focus once it can take it
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

  // A navigation (including back/forward) closes everything.
  onMount(() =>
    watch(
      () => route().path,
      () => {
        closeMenu()
        closeSheet()
      },
    ),
  )

  const path = () => route().path
  const productId = () => productIdOf(path())

  return (
    <HeaderRoot ref={(n: HTMLElement | null) => {
            headerEl = n
          }}>
      <Bar>
        <MarkLink href="/" aria-label="Pyreon home" onClick={click('/', () => closeSheet())}>
          <Glyph id="pyreon" size={24} />
          <Wordmark>pyreon</Wordmark>
        </MarkLink>

        <Show when={() => productId() !== undefined}>
          <Crumbs aria-label="Breadcrumb">
            <CrumbLink href="/products" onClick={click('/products')}>
              products
            </CrumbLink>
            <span aria-hidden="true">/</span>
            <CrumbCurrent aria-current="page">{() => productName(productId() ?? 'form').toLowerCase()}</CrumbCurrent>
          </Crumbs>
          <Spacer />
        </Show>

        <PrimaryNav
          aria-label="Primary"
          ref={(n: HTMLElement | null) => {
            navEl = n
          }}
          onFocusOut={(e: FocusEvent) => {
            const next = e.relatedTarget as Node | null
            if (next && navEl && !navEl.contains(next)) closeMenu()
          }}
        >
          <NavLinkText
            tag="button"
            type="button"
            ref={(n: HTMLElement | null) => {
            menuButtons.products = n
          }}
            aria-expanded={openMenu() === 'products' ? 'true' : 'false'}
            aria-controls={PRODUCTS_ID}
            state={openMenu() === 'products' || path().startsWith('/products') ? 'current' : 'default'}
            onClick={() => toggleMenu('products')}
          >
            {PRODUCTS_LABEL}
            <Chevron />
          </NavLinkText>
          <ProductsPanel id={PRODUCTS_ID} open={() => openMenu() === 'products'} onNavigate={() => closeMenu()} />

          <NavLinkText
            tag="button"
            type="button"
            ref={(n: HTMLElement | null) => {
            menuButtons.why = n
          }}
            aria-expanded={openMenu() === 'why' ? 'true' : 'false'}
            aria-controls={WHY_ID}
            state={openMenu() === 'why' ? 'current' : 'default'}
            onClick={() => toggleMenu('why')}
          >
            {WHY_MENU.label}
            <Chevron />
          </NavLinkText>
          <WhyPanel id={WHY_ID} open={() => openMenu() === 'why'} onNavigate={() => closeMenu()} />

          <For each={BAR_LINKS} by={(l) => l.href}>
            {(l) => (
              <NavLinkText
                href={l.href}
                state={isCurrent(path(), l.href) ? 'current' : 'default'}
                aria-current={isCurrent(path(), l.href) ? 'page' : undefined}
                onClick={click(l.href)}
              >
                {l.label}
              </NavLinkText>
            )}
          </For>
        </PrimaryNav>
        <Show when={() => productId() === undefined}>
          <Spacer />
        </Show>

        <For each={ICON_LINKS} by={(l) => l.href}>
          {(l) => (
            <IconLink href={l.href} aria-label={l.label} onClick={click(l.href)}>
              {l.kind === 'github' ? <GithubIcon /> : <DiscordIcon />}
            </IconLink>
          )}
        </For>

        <IconButton
          type="button"
          aria-label="Dark theme"
          aria-pressed={colorMode() === 'dark' ? 'true' : 'false'}
          title={THEME_LABEL}
          onClick={() => toggleColorMode()}
          data-testid="theme-toggle"
        >
          <ModeIcon state="dark">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
            </svg>
          </ModeIcon>
          <ModeIcon state="light">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </ModeIcon>
        </IconButton>

        <DesktopOnly>
          <Show
            when={() => productId() !== undefined}
            fallback={
              <Pill variant="solid" href={START.href}>
                {START.label}
              </Pill>
            }
          >
            <Pill variant="solid" href="#start">
              Install
            </Pill>
          </Show>
        </DesktopOnly>

        <MenuButtonBox
          type="button"
          ref={(n: HTMLElement | null) => {
            sheetButton = n
          }}
          aria-expanded={sheetOpen() ? 'true' : 'false'}
          aria-controls={SHEET_ID}
          aria-label={sheetOpen() ? MOBILE.close : MOBILE.open}
          onClick={() => (sheetOpen.peek() ? closeSheet() : openSheet())}
          data-testid="menu-button"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d={sheetOpen() ? 'M3.5 3.5l9 9M12.5 3.5l-9 9' : 'M2 4h12M2 8h12M2 12h12'}
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </MenuButtonBox>
      </Bar>
      <MobileSheet id={SHEET_ID} open={() => sheetOpen()} onNavigate={() => closeSheet()} />
    </HeaderRoot>
  )
}

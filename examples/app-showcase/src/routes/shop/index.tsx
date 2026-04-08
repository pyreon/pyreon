import { I18nProvider, useI18n } from '@pyreon/i18n'
import { CartDrawer } from '../../sections/shop/CartDrawer'
import { useCart } from '../../sections/shop/cartStore'
import { shopI18n } from '../../sections/shop/i18n'
import { ProductGrid } from '../../sections/shop/ProductGrid'
import {
  CartBadge,
  CartButton,
  HeaderText,
  ShopHeader,
  ShopLead,
  ShopPage,
  ShopTitle,
  Toolbar,
} from '../../sections/shop/styled'
import { CurrencySwitcher, LocaleSwitcher } from '../../sections/shop/Switchers'

/**
 * Shop section — multi-locale e-commerce mock.
 *
 * Demonstrates four fundamentals working together:
 *   • @pyreon/i18n      — three fully-translated locales (EN/DE/FR)
 *                          covering UI chrome, category names, and
 *                          per-product titles + descriptions. The
 *                          locale switch propagates everywhere on a
 *                          single signal write.
 *   • @pyreon/store     — cart store with derived `itemCount` and
 *                          `subtotal` computeds
 *   • @pyreon/storage   — cart lines, currency choice, and drawer
 *                          state are all persisted to localStorage
 *                          via `useStorage`. Refresh keeps everything.
 *   • @pyreon/url-state — category filter is a URL search param so
 *                          filtered views are shareable
 *
 * The cart drawer is a slide-in panel pinned to the right of the
 * viewport. The whole panel is `position: fixed` so it overlays the
 * page content without disrupting layout.
 */
export default function ShopRoute() {
  return (
    <I18nProvider instance={shopI18n}>
      <ShopBody />
    </I18nProvider>
  )
}

/**
 * Inner component that consumes the i18n context. Split out so the
 * hooks (`useI18n`, `useCart`) run inside the provider's tree —
 * calling `useI18n()` outside the provider throws.
 */
function ShopBody() {
  const i18n = useI18n()
  const cart = useCart()

  return (
    <ShopPage>
      <ShopHeader>
        <HeaderText>
          <ShopTitle>{() => i18n.t('shop:title')}</ShopTitle>
          <ShopLead>{() => i18n.t('shop:tagline')}</ShopLead>
        </HeaderText>
        <Toolbar>
          <LocaleSwitcher />
          <CurrencySwitcher />
          <CartButton type="button" onClick={() => cart.store.openDrawer()}>
            {() => i18n.t('shop:viewCart')}
            <CartBadge>{() => cart.store.itemCount()}</CartBadge>
          </CartButton>
        </Toolbar>
      </ShopHeader>

      <ProductGrid />
      <CartDrawer />
    </ShopPage>
  )
}

export const meta = {
  title: 'Shop — Pyreon App Showcase',
}

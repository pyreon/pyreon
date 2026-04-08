import { useI18n } from '@pyreon/i18n'
import { PRODUCTS } from './data/products'
import { formatPrice } from './i18n'
import { useCart } from './cartStore'
import {
  Backdrop,
  CheckoutButton,
  CloseButton,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  EmptyDrawer,
  CartLineRow,
  LineInfo,
  LineQtyRow,
  LineThumb,
  LineTitle,
  LineTotal,
  QtyButton,
  RemoveLink,
  SubtotalAmount,
  SubtotalRow,
} from './styled'

/**
 * Slide-in cart drawer.
 *
 * Renders a slide-in panel with the current cart lines, quantity
 * controls, line totals, and a footer with the subtotal + checkout
 * button. The whole panel is translated via `i18n.t(...)`, so
 * switching locale updates everything reactively, including the
 * `count` plural ("1 article" / "3 articles" in French).
 */
export function CartDrawer() {
  const i18n = useI18n()
  const cart = useCart()
  const { store } = cart

  return (
    <>
      <Backdrop $open={store.drawerOpen()} onClick={() => store.closeDrawer()} />
      <Drawer $open={store.drawerOpen()}>
        <DrawerHeader>
          <DrawerTitle>
            {() => i18n.t('shop:cartTitle')} ·{' '}
            {() => i18n.t('shop:items', { count: store.itemCount() })}
          </DrawerTitle>
          <CloseButton
            type="button"
            onClick={() => store.closeDrawer()}
            title={i18n.t('shop:closeCart')}
            aria-label={i18n.t('shop:closeCart')}
          >
            ×
          </CloseButton>
        </DrawerHeader>

        <DrawerBody>
          {() => {
            const lines = store.lines()
            if (lines.length === 0) {
              return <EmptyDrawer>{i18n.t('shop:cartEmpty')}</EmptyDrawer>
            }
            return lines.map((line) => {
              const product = PRODUCTS.find((p) => p.id === line.productId)
              if (!product) return null
              return (
                <CartLineRow>
                  <LineThumb>{product.emoji}</LineThumb>
                  <LineInfo>
                    <LineTitle>{() => i18n.t(`product:${product.id}.title`)}</LineTitle>
                    <LineQtyRow>
                      <QtyButton
                        type="button"
                        onClick={() => store.setQty(product.id, line.qty - 1)}
                        aria-label="−"
                      >
                        −
                      </QtyButton>
                      <span>{line.qty}</span>
                      <QtyButton
                        type="button"
                        onClick={() => store.setQty(product.id, line.qty + 1)}
                        aria-label="+"
                      >
                        +
                      </QtyButton>
                      <RemoveLink type="button" onClick={() => store.removeFromCart(product.id)}>
                        {() => i18n.t('shop:remove')}
                      </RemoveLink>
                    </LineQtyRow>
                  </LineInfo>
                  <LineTotal>
                    {() => formatPrice(product.priceUsd * line.qty, store.currency(), i18n.locale())}
                  </LineTotal>
                </CartLineRow>
              )
            })
          }}
        </DrawerBody>

        <DrawerFooter>
          <SubtotalRow>
            <span>{() => i18n.t('shop:subtotal')}</span>
            <SubtotalAmount>
              {() => formatPrice(store.subtotalUsd(), store.currency(), i18n.locale())}
            </SubtotalAmount>
          </SubtotalRow>
          <CheckoutButton
            type="button"
            disabled={store.itemCount() === 0}
            onClick={() => {
              // Demo "checkout": clear the cart and close the drawer.
              store.clearCart()
              store.closeDrawer()
            }}
          >
            {() => i18n.t('shop:checkout')}
          </CheckoutButton>
        </DrawerFooter>
      </Drawer>
    </>
  )
}

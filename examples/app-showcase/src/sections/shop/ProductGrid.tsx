import { useI18n } from '@pyreon/i18n'
import { useUrlState } from '@pyreon/url-state'
import { PRODUCTS } from './data/products'
import type { Category, Product } from './data/types'
import { formatPrice } from './i18n'
import { useCart } from './cartStore'
import {
  AddButton,
  FilterChip,
  Filters,
  ProductBody,
  ProductCard,
  ProductCategory,
  ProductDesc,
  ProductFooter,
  ProductGrid as Grid,
  ProductImage,
  ProductPrice,
  ProductTitle,
} from './styled'

const CATEGORIES: Array<Category | 'all'> = ['all', 'apparel', 'home', 'tech', 'books']

/**
 * Product grid + category filter chips.
 *
 * The active category is stored in the URL via `useUrlState('category')`
 * so a filtered view is shareable. Switching the i18n locale re-renders
 * every product title/description because each `t()` call subscribes
 * to the locale signal.
 */
export function ProductGrid() {
  const i18n = useI18n()
  const cart = useCart()
  const filter = useUrlState<Category | 'all'>('category', 'all')

  const visibleProducts = (): Product[] => {
    const active = filter()
    if (active === 'all') return PRODUCTS
    return PRODUCTS.filter((p) => p.category === active)
  }

  return (
    <>
      <Filters>
        {CATEGORIES.map((cat) => (
          <FilterChip
            type="button"
            $active={filter() === cat}
            onClick={() => filter.set(cat)}
          >
            {() => (cat === 'all' ? i18n.t('shop:filterAll') : i18n.t(`category:${cat}`))}
          </FilterChip>
        ))}
      </Filters>

      <Grid>
        {() =>
          visibleProducts().map((product) => (
            <ProductCard>
              <ProductImage>{product.emoji}</ProductImage>
              <ProductBody>
                <ProductCategory>
                  {() => i18n.t(`category:${product.category}`)}
                </ProductCategory>
                <ProductTitle>
                  {() => i18n.t(`product:${product.id}.title`)}
                </ProductTitle>
                <ProductDesc>{() => i18n.t(`product:${product.id}.desc`)}</ProductDesc>
                <ProductFooter>
                  <ProductPrice>
                    {() =>
                      formatPrice(
                        product.priceUsd,
                        cart.store.currency(),
                        i18n.locale(),
                      )
                    }
                  </ProductPrice>
                  <AddButton type="button" onClick={() => cart.store.addToCart(product.id)}>
                    {() => i18n.t('shop:addToCart')}
                  </AddButton>
                </ProductFooter>
              </ProductBody>
            </ProductCard>
          ))
        }
      </Grid>
    </>
  )
}

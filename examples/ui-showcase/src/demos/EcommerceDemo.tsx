import { signal } from '@pyreon/reactivity'
import {
  Card,
  Title,
  Paragraph,
  Badge,
  Button,
  IconButton,
  Chip,
  Highlight,
  GridContainer,
  GridRow,
  GridCol,
} from '@pyreon/ui-components'

const products = [
  {
    id: 1,
    name: 'Wireless Noise-Canceling Headphones',
    description: 'Premium over-ear headphones with active noise cancellation, 30-hour battery life, and crystal-clear audio.',
    price: 249.99,
    originalPrice: 299.99,
    category: 'Audio',
    features: ['Bluetooth 5.3', 'ANC', '30h Battery'],
    inStock: true,
  },
  {
    id: 2,
    name: 'Mechanical Keyboard Pro',
    description: 'Hot-swappable switches, per-key RGB lighting, aluminum frame, and programmable macros for the ultimate typing experience.',
    price: 179.99,
    originalPrice: null,
    category: 'Peripherals',
    features: ['Hot-swap', 'RGB', 'Wireless'],
    inStock: true,
  },
  {
    id: 3,
    name: 'Ultra-Wide Curved Monitor',
    description: '34-inch UWQHD display with 165Hz refresh rate, HDR600, and USB-C PD for a seamless desktop setup.',
    price: 599.99,
    originalPrice: 749.99,
    category: 'Displays',
    features: ['34" UWQHD', '165Hz', 'USB-C'],
    inStock: true,
  },
  {
    id: 4,
    name: 'Ergonomic Standing Desk',
    description: 'Electric height-adjustable desk with memory presets, cable management, and a bamboo desktop surface.',
    price: 449.99,
    originalPrice: null,
    category: 'Furniture',
    features: ['Electric', 'Memory', 'Bamboo'],
    inStock: false,
  },
  {
    id: 5,
    name: 'Developer Backpack',
    description: 'Water-resistant backpack with padded laptop compartment, USB charging port, and organizer pockets for all your gear.',
    price: 89.99,
    originalPrice: 109.99,
    category: 'Accessories',
    features: ['Waterproof', 'USB Port', '15.6"'],
    inStock: true,
  },
  {
    id: 6,
    name: 'Smart Webcam 4K',
    description: 'AI-powered webcam with auto-framing, background blur, and dual noise-canceling microphones for remote work.',
    price: 149.99,
    originalPrice: null,
    category: 'Audio',
    features: ['4K', 'Auto-frame', 'AI'],
    inStock: true,
  },
]

const categoryColor = (cat: string) => {
  if (cat === 'Audio') return 'primary'
  if (cat === 'Peripherals') return 'secondary'
  if (cat === 'Displays') return 'success'
  if (cat === 'Furniture') return 'warning'
  return 'info'
}

export function EcommerceDemo() {
  const cartCount = signal(0)
  const wishlist = signal<Set<number>>(new Set())

  const addToCart = () => {
    cartCount.update((n) => n + 1)
  }

  const toggleWishlist = (id: number) => {
    wishlist.update((set) => {
      const next = new Set(set)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">E-Commerce</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Product card grid using SimpleGrid, Card, Badge, Chip, Button, IconButton, and Highlight.
      </p>

      {/* Cart summary */}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <Title {...{ size: 'h5' } as any}>Featured Products</Title>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 14px; color: #6b7280;">Cart:</span>
          <Badge {...{ state: 'primary', size: 'sm' } as any}>
            {() => `${cartCount()} items`}
          </Badge>
        </div>
      </div>

      {/* Product Grid */}
      <GridContainer><GridRow>
        {products.map((product) => (
          <GridCol size={4}><Card {...{ variant: 'outline' } as any}>
            {/* Image placeholder */}
            <div
              style="width: 100%; height: 180px; background: linear-gradient(135deg, #f0f4ff 0%, #e8ecf8 100%); border-radius: 8px; margin-bottom: 16px; display: flex; align-items: center; justify-content: center;"
            >
              <span style="font-size: 40px; opacity: 0.3;">
                {product.category === 'Audio' ? '🎧' : product.category === 'Peripherals' ? '⌨' : product.category === 'Displays' ? '🖥' : product.category === 'Furniture' ? '🪑' : product.category === 'Accessories' ? '🎒' : '📷'}
              </span>
            </div>

            {/* Category Badge */}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <Badge {...{ state: categoryColor(product.category), size: 'sm', variant: 'subtle' } as any}>
                {product.category}
              </Badge>
              {!product.inStock && (
                <Badge {...{ state: 'danger', size: 'sm' } as any}>Out of Stock</Badge>
              )}
            </div>

            {/* Title */}
            <Title {...{ size: 'h6', style: 'margin-bottom: 8px;' } as any}>{product.name}</Title>

            {/* Description */}
            <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-bottom: 12px; min-height: 60px;' } as any}>
              {product.description}
            </Paragraph>

            {/* Feature chips */}
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;">
              {product.features.map((feature) => (
                <Chip {...{ size: 'sm', variant: 'outline' } as any}>{feature}</Chip>
              ))}
            </div>

            {/* Price */}
            <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 16px;">
              <Highlight {...{ style: 'font-size: 20px; font-weight: 700;' } as any}>
                ${product.price.toFixed(2)}
              </Highlight>
              {product.originalPrice && (
                <span style="font-size: 14px; color: #9ca3af; text-decoration: line-through;">
                  ${product.originalPrice.toFixed(2)}
                </span>
              )}
              {product.originalPrice && (
                <Badge {...{ state: 'danger', size: 'sm' } as any}>
                  -{Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}%
                </Badge>
              )}
            </div>

            {/* Actions */}
            <div style="display: flex; gap: 8px; align-items: center;">
              <Button
                {...{ state: 'primary', size: 'sm', style: 'flex: 1;' } as any}
                disabled={!product.inStock}
                onClick={addToCart}
              >
                {product.inStock ? 'Add to Cart' : 'Sold Out'}
              </Button>
              <IconButton
                {...{ state: 'secondary', size: 'sm', variant: 'outline' } as any}
                onClick={() => toggleWishlist(product.id)}
                aria-label="Add to wishlist"
              >
                {() => wishlist().has(product.id) ? '\u2665' : '\u2661'}
              </IconButton>
            </div>
          </Card></GridCol>
        ))}
      </GridRow></GridContainer>
    </div>
  )
}

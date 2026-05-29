import { signal } from '@pyreon/reactivity'
import { average, filter, groupBy, map, pipe, sum } from '@pyreon/rx'

interface Product {
  id: number
  name: string
  category: 'tools' | 'food' | 'books'
  price: number
  inStock: boolean
}

const initial: Product[] = [
  { id: 1, name: 'Hammer', category: 'tools', price: 24, inStock: true },
  { id: 2, name: 'Bread', category: 'food', price: 4, inStock: true },
  { id: 3, name: 'Drill', category: 'tools', price: 89, inStock: false },
  { id: 4, name: 'Apples', category: 'food', price: 6, inStock: true },
  { id: 5, name: 'Pyreon Book', category: 'books', price: 32, inStock: true },
  { id: 6, name: 'Screwdriver', category: 'tools', price: 12, inStock: false },
  { id: 7, name: 'JS Book', category: 'books', price: 18, inStock: true },
]

const products = signal<Product[]>(initial)
const minPrice = signal(0)

export function RxDemo() {
  // Pure transforms — each is a Computed<...> that auto-recomputes when
  // either `products` or `minPrice` changes.
  const inStockOnly = filter(products, (p) => p.inStock)
  // pipe collapses N operators into a single computed (one subscription
  // to `products`, one dependency chain to recompute).
  const aboveMin = pipe(
    products,
    (arr) => arr.filter((p) => p.price >= minPrice()),
    (arr) => [...arr].sort((a, b) => a.price - b.price),
  )
  const names = map(inStockOnly, (p) => p.name)
  const byCategory = groupBy(inStockOnly, (p) => p.category)
  const totalInStock = sum(map(inStockOnly, (p) => p.price))
  const avgPrice = average(map(products, (p) => p.price))

  return (
    <div>
      <h2>Rx</h2>
      <p class="desc">
        Signal-aware reactive transforms. 37 functions across 6 categories. Compose with{' '}
        <code>pipe()</code> — each transform returns a Computed that auto-re-derives when the source
        signal changes.
      </p>

      <div class="section">
        <h3>Source data ({() => products().length} items)</h3>
        <div class="row" style="margin-bottom: 12px">
          <button
            onClick={() =>
              products.update((arr) => [
                ...arr,
                {
                  id: Math.max(...arr.map((p) => p.id)) + 1,
                  name: `Item ${arr.length + 1}`,
                  category: 'tools' as const,
                  price: Math.round(10 + Math.random() * 90),
                  inStock: Math.random() > 0.3,
                },
              ])
            }
          >
            Add random item
          </button>
          <button onClick={() => products.set(initial)}>Reset</button>
        </div>
      </div>

      <div class="section">
        <h3>filter — inStock=true ({() => inStockOnly().length} items)</h3>
        <div data-testid="rx-instock">{() => names().join(', ')}</div>
      </div>

      <div class="section">
        <h3>pipe(filter + sortBy) — price ≥ minPrice</h3>
        <div class="row" style="margin-bottom: 12px">
          <label>Min price: ${() => minPrice()}</label>
          <input
            type="range"
            min="0"
            max="100"
            value={() => String(minPrice())}
            onInput={(e) => minPrice.set(Number(e.currentTarget.value))}
            style="width: 200px"
          />
        </div>
        <div data-testid="rx-above-min">
          {() =>
            aboveMin()
              .map((p) => `${p.name} ($${p.price})`)
              .join(' · ')
          }
        </div>
      </div>

      <div class="section">
        <h3>groupBy — by category</h3>
        <div data-testid="rx-groups">
          {() =>
            Object.entries(byCategory()).map(([cat, items]) => (
              <div>
                <strong>{cat}</strong>: {items.map((p) => p.name).join(', ')}
              </div>
            ))
          }
        </div>
      </div>

      <div class="section">
        <h3>Aggregations</h3>
        <p>
          Total value (in stock): <strong data-testid="rx-total">${() => totalInStock()}</strong>
        </p>
        <p>
          Average price (all): <strong data-testid="rx-avg">${() => avgPrice().toFixed(2)}</strong>
        </p>
      </div>
    </div>
  )
}

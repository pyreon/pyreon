import type { ProductData } from './model'
import { loadVisuals } from './visuals'

/**
 * Product content files, one lazy chunk each (`import.meta.glob`), so a
 * product page loads only its own JSON. The build plugin
 * (vite-plugins/product-content.ts) has already highlighted their code.
 *
 * `PRODUCT_IDS` are the products whose content file is in the app: exactly
 * the pages that get prerendered. Dropping `<id>.json` into `products/`
 * (scripts/sync-site-content.ts) adds the page.
 */
const files = import.meta.glob<ProductData>(['./products/*.json', '!./products/_*.json'], { import: 'default' })

const idOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1, -'.json'.length)

const LOADERS = new Map(Object.entries(files).map(([path, load]) => [idOf(path), load]))

export const PRODUCT_IDS: readonly string[] = [...LOADERS.keys()].sort()

export function hasProduct(id: string): boolean {
  return LOADERS.has(id)
}

export async function loadProduct(id: string): Promise<ProductData | undefined> {
  const load = LOADERS.get(id)
  if (!load) return undefined
  // The page's visuals (hero, share image) ride along when the asset sync has
  // written them; both are lazy chunks of their own.
  const [data, visuals] = await Promise.all([load(), loadVisuals(id)])
  return visuals ? { ...data, visuals } : data
}

// GET /api/items — https://nuxt.com/docs/4.x/directory-structure/server
import { formatPrice, listItems } from '../../lib/data'

export default defineEventHandler(async () => {
  const items = await listItems()
  return items.map((item) => ({ id: item.id, name: item.name, price: formatPrice(item.price) }))
})

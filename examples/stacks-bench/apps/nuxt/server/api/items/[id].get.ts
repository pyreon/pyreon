// GET /api/items/:id — https://nuxt.com/docs/4.x/directory-structure/server
import { formatPrice, getItem } from '../../lib/data'

export default defineEventHandler(async (event) => {
  const item = await getItem(Number(getRouterParam(event, 'id')))
  if (!item) {
    throw createError({ status: 404, statusText: 'Item Not Found' })
  }
  return { ...item, price: formatPrice(item.price) }
})

// POST /api/items — https://nuxt.com/docs/4.x/directory-structure/server
// readFormData (h3 v1, the version Nitro 2 ships) — https://v1.h3.dev/utils/request
import { addItem, validateName } from '../../lib/data'

export default defineEventHandler(async (event) => {
  const form = await readFormData(event)
  const check = validateName(form.get('name'))
  if (!check.ok) {
    throw createError({ status: 400, message: check.error })
  }
  const item = await addItem(check.name)
  return { id: item.id }
})

// Server loader for /items/:id — https://pyreon.dev/docs/zero#server-loaders
// Unknown id → `notFound()` (router docs, "notFound() — trigger a 404 boundary").
import { notFound } from '@pyreon/router'
import { getItem } from '../../server/data'

export async function serverLoader(ctx: { params: Record<string, string> }) {
  const item = await getItem(Number(ctx.params.id))
  if (!item) notFound()
  return { item }
}

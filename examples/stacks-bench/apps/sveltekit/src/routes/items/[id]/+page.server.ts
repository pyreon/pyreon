// /items/:id — https://svelte.dev/docs/kit/load + https://svelte.dev/docs/kit/errors (error(404))
import { error } from '@sveltejs/kit'
import { getItem } from '#lib/server/data.ts'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params }) => {
  const item = await getItem(Number(params.id))
  if (!item) error(404, 'Not Found')
  return { item }
}

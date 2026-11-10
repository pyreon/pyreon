// /items — https://svelte.dev/docs/kit/load (server load) + https://svelte.dev/docs/kit/form-actions
import { fail, redirect } from '@sveltejs/kit'
import { addItem, listItems, validateName } from '#lib/server/data.ts'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async () => {
  return { items: await listItems() }
}

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData()
    const check = validateName(data.get('name'))
    if (!check.ok) return fail(400, { error: check.error })
    const item = await addItem(check.name)
    redirect(303, `/items/${item.id}`)
  },
} satisfies Actions

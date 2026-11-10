// Server functions + queries/actions, following:
//   https://docs.solidjs.com/solid-start/building-your-application/data-loading  (query + "use server" + createAsync, route preload)
//   https://docs.solidjs.com/solid-start/guides/data-mutation                     (action + useSubmission, return errors, throw redirect)
//   https://docs.solidjs.com/solid-router/reference/data-apis/query
import { action, query, redirect } from '@solidjs/router'
import { addItem, getItem, listItems, validateName } from './data'

export const getItems = query(async () => {
  'use server'
  return listItems()
}, 'items')

export const getItemById = query(async (id: number) => {
  'use server'
  return (await getItem(id)) ?? null
}, 'item')

export const addItemAction = action(async (formData: FormData) => {
  'use server'
  const check = validateName(formData.get('name'))
  if (!check.ok) return { error: check.error }
  const item = await addItem(check.name)
  throw redirect(`/items/${item.id}`)
}, 'addItem')

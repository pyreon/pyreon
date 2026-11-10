// Server functions — https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
// (GET server function for loaders; POST with FormData; `redirect` / `notFound` thrown from a server function).
import { notFound, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { addItem, getItem, listItems, validateName } from './data'

export const getItems = createServerFn({ method: 'GET' }).handler(() => listItems())

export const getItemById = createServerFn({ method: 'GET' })
  .validator((id: number) => id)
  .handler(async ({ data: id }) => {
    const item = await getItem(id)
    if (!item) throw notFound()
    return item
  })

export const addItemFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error('Expected FormData')
    return data
  })
  .handler(async ({ data }) => {
    const check = validateName(data.get('name'))
    if (!check.ok) return { error: check.error }
    const item = await addItem(check.name)
    throw redirect({ to: '/items/$id', params: { id: String(item.id) } })
  })

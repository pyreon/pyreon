import { h } from '@pyreon/core'
import { useLoaderData } from '@pyreon/router'
import { recordThread } from '../thread-log'

export const getStaticPaths = () =>
  Array.from({ length: 16 }, (_, i) => ({ params: { id: String(i) } }))

export const loader = async (ctx: { params: { id: string } }) => {
  await recordThread(`/${ctx.params.id}`)
  // A little CPU per page so work actually spreads across workers.
  let x = 0
  for (let i = 0; i < 200_000; i++) x = (x + i * 31) % 1_000_003
  return { id: ctx.params.id, x }
}

export default function Item() {
  const data = useLoaderData<{ id: string; x: number }>()
  return h('article', null, h('h1', null, `Item ${data.id}`), h('p', null, `checksum ${data.x}`))
}

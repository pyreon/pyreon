import { h } from '@pyreon/core'
import { useLoaderData } from '@pyreon/router'
import type { LoaderContext } from '@pyreon/zero'

interface LoaderData {
  userId: string
  name: string
}

export async function loader(ctx: LoaderContext): Promise<LoaderData> {
  return { userId: ctx.params.id as string, name: `User ${ctx.params.id}` }
}

export default function UserPage() {
  const data = useLoaderData<LoaderData | undefined>()
  return h(
    'h1',
    { 'data-user-name': () => data()?.name },
    () => data()?.name ?? 'User Page (no loader data)',
  )
}

export const meta = {
  title: 'User',
}

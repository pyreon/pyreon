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
  if (!data) return <h1 data-no-data>User Page (no loader data)</h1>
  return <h1 data-user-name={data.name}>{data.name}</h1>
}

export const meta = {
  title: 'User',
}

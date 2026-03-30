import type { LoaderContext } from '@pyreon/zero'

export async function loader(ctx: LoaderContext) {
  return { userId: ctx.params.id, name: `User ${ctx.params.id}` }
}

export default function UserPage() {
  return <h1>User Page</h1>
}

export const meta = {
  title: 'User',
}

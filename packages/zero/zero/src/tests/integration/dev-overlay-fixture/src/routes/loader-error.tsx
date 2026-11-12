import { useLoaderData } from '@pyreon/router'

interface Account {
  profile?: { name: string }
}

async function fetchAccount(): Promise<Account> {
  return {}
}

export async function loader() {
  const account = await fetchAccount()
  return { name: account.profile!.name }
}

export default function AccountPage() {
  const data = useLoaderData<{ name: string }>()
  return <h1>{data.name}</h1>
}

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@pyreon/query'
import { signal } from '@pyreon/reactivity'

interface User {
  id: number
  name: string
  email: string
}

let mockUsers: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
]
let nextId = 3

async function fetchUsers(): Promise<User[]> {
  await new Promise((r) => setTimeout(r, 400))
  return [...mockUsers]
}

async function createUser(input: { name: string; email: string }): Promise<User> {
  await new Promise((r) => setTimeout(r, 300))
  const user = { id: nextId++, ...input }
  mockUsers = [...mockUsers, user]
  return user
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000 } },
})

function QueryContent() {
  const client = useQueryClient()
  const nameInput = signal('')
  const emailInput = signal('')

  const { data, isPending, isFetching, refetch } = useQuery(() => ({
    queryKey: ['users'],
    queryFn: fetchUsers,
  }))

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['users'] })
      nameInput.set('')
      emailInput.set('')
    },
  })

  return (
    <div>
      <div class="section">
        <h3>User List</h3>
        {() => {
          if (isPending()) return <p>Loading users...</p>
          const users = data()
          if (!users) return <p>No data</p>
          return (
            <div>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div class="row" style="margin-top: 8px">
                <button onClick={() => refetch()}>
                  {() => (isFetching() ? 'Refreshing...' : 'Refresh')}
                </button>
                <span class="badge gray">{() => `${users.length} users`}</span>
              </div>
            </div>
          )
        }}
      </div>

      <div class="section">
        <h3>Create User</h3>
        <div class="field">
          <label>Name</label>
          <input
            placeholder="Name"
            value={nameInput()}
            onInput={(e: Event) => nameInput.set((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="field">
          <label>Email</label>
          <input
            type="email"
            placeholder="email@example.com"
            value={emailInput()}
            onInput={(e: Event) => emailInput.set((e.target as HTMLInputElement).value)}
          />
        </div>
        <button
          class="primary"
          disabled={mutation.isPending() || !nameInput() || !emailInput()}
          onClick={() => mutation.mutate({ name: nameInput(), email: emailInput() })}
        >
          {() => (mutation.isPending() ? 'Creating...' : 'Add User')}
        </button>
        {() =>
          mutation.isError() ? (
            <div class="error" style="margin-top: 8px">
              {String(mutation.error())}
            </div>
          ) : null
        }
      </div>
    </div>
  )
}

export function QueryDemo() {
  return (
    <div>
      <h2>Query</h2>
      <p class="desc">
        TanStack Query adapter. Reactive data fetching with caching, mutations, and invalidation.
      </p>
      <QueryClientProvider client={queryClient}>
        <QueryContent />
      </QueryClientProvider>
    </div>
  )
}

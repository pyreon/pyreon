// A `use` array that CANNOT lower (refresh + a custom function): every call on the client stays web, and each
// unlowerable entry is named in a warning — never a native request without the middleware.
import { createHttp } from '@pyreon/http'
import { bearer, refresh } from '@pyreon/http/middleware'
import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'

interface Me {
  name: string
}

const stamp = async (_req: unknown, next: () => Promise<unknown>) => next()

const api = createHttp({
  baseUrl: 'https://api.example.com',
  use: [bearer(() => 'static'), refresh({ refresh: async () => true }), stamp],
})
const getMe = api.endpoint('GET /me')

export function MeView() {
  const me = useFetch<Me>(getMe())
  return (
    <Stack>
      <Text>{me.data()?.name ?? ''}</Text>
    </Stack>
  )
}

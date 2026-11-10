// /items/:id — https://docs.solidjs.com/solid-start/building-your-application/data-loading
// 404 via <HttpStatusCode> — https://docs.solidjs.com/solid-start/reference/server/http-status-code
import { A, createAsync, type RouteDefinition, useParams } from '@solidjs/router'
import { HttpStatusCode } from '@solidjs/start'
import { Show } from 'solid-js'
import { getItemById } from '~/lib/api'
import { formatPrice } from '~/lib/data'

export const route = {
  preload: ({ params }) => getItemById(Number(params.id)),
} satisfies RouteDefinition

export default function ItemPage() {
  const params = useParams()
  const item = createAsync(() => getItemById(Number(params.id)))
  return (
    <Show
      when={item()}
      fallback={
        <main>
          <HttpStatusCode code={404} />
          <h1>Not Found</h1>
        </main>
      }
    >
      {(it) => (
        <main>
          <h1 id="item-name">{it().name}</h1>
          <p>{it().description}</p>
          <p class="price">{formatPrice(it().price)}</p>
          <A href="/items">Back</A>
        </main>
      )}
    </Show>
  )
}

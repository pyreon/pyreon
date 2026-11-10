// /items — https://docs.solidjs.com/solid-start/building-your-application/data-loading (createAsync + route preload)
//          https://docs.solidjs.com/solid-start/guides/data-mutation (form action + useSubmission)
//          https://docs.solidjs.com/solid-router/reference/components/a (<A>)
import { A, createAsync, type RouteDefinition, useSubmission } from '@solidjs/router'
import { For, Show } from 'solid-js'
import Counter from '~/components/Counter'
import { addItemAction, getItems } from '~/lib/api'
import { formatPrice } from '~/lib/data'

export const route = {
  preload: () => getItems(),
} satisfies RouteDefinition

export default function Items() {
  const items = createAsync(() => getItems())
  const submission = useSubmission(addItemAction)
  return (
    <main>
      <h1>Items</h1>
      <Counter />
      <ul id="items">
        <For each={items()}>
          {(item) => (
            <li>
              <A href={`/items/${item.id}`}>{item.name}</A> <span class="price">{formatPrice(item.price)}</span>
            </li>
          )}
        </For>
      </ul>
      <form action={addItemAction} method="post">
        <input name="name" />
        <button type="submit">Add</button>
      </form>
      <Show when={submission.result?.error}>
        <p id="form-error">{submission.result?.error}</p>
      </Show>
    </main>
  )
}

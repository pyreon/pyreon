// https://qwik.dev/docs/route-loader/
// https://qwik.dev/docs/action/
// https://qwik.dev/docs/guides/redirects/
// https://qwik.dev/docs/components/state/ (useSignal counter)
// https://qwik.dev/docs/api/#link
import { component$, useSignal } from "@builder.io/qwik";
import { Form, Link, routeAction$, routeLoader$ } from "@builder.io/qwik-city";
import { addItem, formatPrice, listItems, validateName } from "~/lib/data";

export const useItems = routeLoader$(async () => {
  return await listItems();
});

export const useAddItem = routeAction$(async (data, { fail, redirect }) => {
  const check = validateName(data.name);
  if (!check.ok) {
    return fail(400, { error: check.error });
  }
  const item = await addItem(check.name);
  throw redirect(302, `/items/${item.id}`);
});

const Counter = component$(() => {
  const count = useSignal(0);
  return (
    <button id="counter" type="button" onClick$={() => count.value++}>
      Count: {count.value}
    </button>
  );
});

export default component$(() => {
  const items = useItems();
  const action = useAddItem();
  return (
    <>
      <h1>Items</h1>
      <Counter />
      <ul id="items">
        {items.value.map((item) => (
          <li key={item.id}>
            <Link href={`/items/${item.id}`}>{item.name}</Link>{" "}
            <span class="price">{formatPrice(item.price)}</span>
          </li>
        ))}
      </ul>
      <Form action={action}>
        <input name="name" />
        <button type="submit">Add</button>
      </Form>
      {action.value?.failed && <p id="form-error">{action.value.error}</p>}
    </>
  );
});

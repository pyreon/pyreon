// https://qwik.dev/docs/route-loader/ (not-found: `requestEvent.fail(404, …)`)
import { component$ } from "@builder.io/qwik";
import { Link, routeLoader$ } from "@builder.io/qwik-city";
import { formatPrice, getItem } from "~/lib/data";

export const useItem = routeLoader$(async (requestEvent) => {
  const item = await getItem(Number(requestEvent.params.id));
  if (!item) {
    return requestEvent.fail(404, { errorMessage: "Item not found" });
  }
  return item;
});

export default component$(() => {
  const item = useItem();
  if (item.value.failed) {
    return <h1>{item.value.errorMessage}</h1>;
  }
  return (
    <>
      <h1 id="item-name">{item.value.name}</h1>
      <p>{item.value.description}</p>
      <p class="price">{formatPrice(item.value.price)}</p>
      <Link href="/items">Back</Link>
    </>
  );
});

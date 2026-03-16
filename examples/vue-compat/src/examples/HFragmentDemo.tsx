import { Fragment, h, ref } from "@pyreon/vue-compat"
import Demo from "./Demo"

export default function HFragmentDemo() {
  const items = ref(["one", "two", "three"])

  return (
    <Demo
      title="h() & Fragment"
      apis="h, Fragment"
      code={`// h() — manual VNode creation
h("p", null, "Created with h()")

// Fragment — group without wrapper
h(Fragment, null,
  h("span", null, "A"),
  h("span", null, "B"),
)`}
    >
      {h("p", null, "This paragraph was created with ", h("strong", null, "h()"))}
      {h(
        Fragment,
        null,
        h("p", { class: "muted" }, "Fragment child 1"),
        h("p", { class: "muted" }, "Fragment child 2"),
      )}
      <p>
        Items: <strong>{() => items.value.join(", ")}</strong>
      </p>
      <button
        type="button"
        onClick={() => (items.value = [...items.value, `item-${items.value.length + 1}`])}
      >
        Add item
      </button>
    </Demo>
  )
}

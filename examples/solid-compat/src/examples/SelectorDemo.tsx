import { For } from "@pyreon/core";
import { createSelector, createSignal } from "solid-js";
import Demo from "./Demo";

export default function SelectorDemo() {
  const [selected, setSelected] = createSignal(1);
  const isSelected = createSelector(selected);
  const ids = [1, 2, 3, 4, 5];

  return (
    <Demo
      title="Efficient Selection"
      apis="createSelector"
      code={`const [selected, setSelected] = createSignal(1);
const isSelected = createSelector(selected);

// Only the prev and next selected item re-render
<button class={isSelected(id) ? "selected" : ""}>
  Item {id}
</button>`}
    >
      <div class="row">
        <For each={() => ids} by={(id) => id}>
          {(id) => (
            <button
              type="button"
              class={isSelected(id) ? "selected" : ""}
              onClick={() => setSelected(id)}
            >
              Item {id}
            </button>
          )}
        </For>
      </div>
      <p class="muted">Selected: {selected()}</p>
    </Demo>
  );
}

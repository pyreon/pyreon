import { reactive, toRef, toRefs } from "vue";
import Demo from "./Demo";

export default function ToRefDemo() {
  const state = reactive({ width: 100, height: 200 });
  const widthRef = toRef(state, "width");
  const { height } = toRefs(state);

  return (
    <Demo
      title="toRef & toRefs"
      apis="toRef, toRefs"
      code={`const state = reactive({ width: 100, height: 200 })
const widthRef = toRef(state, "width")
const { height } = toRefs(state)

// Both stay linked to the reactive object
widthRef.value = 300  // also updates state.width
height.value = 400    // also updates state.height`}
    >
      <p>
        widthRef.value: <strong>{widthRef.value}</strong> | state.width:{" "}
        <strong>{state.width}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => (widthRef.value += 50)}>
          widthRef += 50
        </button>
        <button type="button" onClick={() => (state.width += 10)}>
          state.width += 10
        </button>
      </div>
      <p>
        height.value: <strong>{height.value}</strong> | state.height:{" "}
        <strong>{state.height}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => (height.value += 50)}>
          height += 50
        </button>
        <button type="button" onClick={() => (state.height += 10)}>
          state.height += 10
        </button>
      </div>
    </Demo>
  );
}

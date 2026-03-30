import { useReducer } from "preact/hooks";
import Demo from "./Demo";

type CounterAction = { type: "inc" } | { type: "dec" } | { type: "reset" };

function counterReducer(state: number, action: CounterAction): number {
  switch (action.type) {
    case "inc":
      return state + 1;
    case "dec":
      return state - 1;
    case "reset":
      return 0;
  }
}

export default function UseReducerDemo() {
  const [count, dispatch] = useReducer(counterReducer, 0);

  return (
    <Demo
      title="useReducer"
      apis="useReducer"
      code={`const [count, dispatch] = useReducer(reducer, 0)
dispatch({ type: "inc" })`}
    >
      <p>
        count: <strong>{count}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => dispatch({ type: "inc" })}>
          Increment
        </button>
        <button type="button" onClick={() => dispatch({ type: "dec" })}>
          Decrement
        </button>
        <button type="button" onClick={() => dispatch({ type: "reset" })}>
          Reset
        </button>
      </div>
    </Demo>
  );
}

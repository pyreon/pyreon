import { useReducer } from "react"
import Demo from "./Demo"

type CounterAction = { type: "increment" } | { type: "decrement" } | { type: "reset" }

function counterReducer(state: number, action: CounterAction): number {
  switch (action.type) {
    case "increment":
      return state + 1
    case "decrement":
      return state - 1
    case "reset":
      return 0
  }
}

export default function UseReducerDemo() {
  const [count, dispatch] = useReducer(counterReducer, 0)

  return (
    <Demo
      title="Reducer Hook"
      apis="useReducer"
      code={`function reducer(state, action) {
  switch (action.type) {
    case "increment": return state + 1;
    case "decrement": return state - 1;
    case "reset": return 0;
  }
}

const [count, dispatch] = useReducer(reducer, 0);
dispatch({ type: "increment" });`}
    >
      <p>
        Count: <strong>{count}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => dispatch({ type: "increment" })}>
          +
        </button>
        <button type="button" onClick={() => dispatch({ type: "decrement" })}>
          -
        </button>
        <button type="button" onClick={() => dispatch({ type: "reset" })}>
          Reset
        </button>
      </div>
    </Demo>
  )
}

import { useState } from "react";
import Demo from "./Demo";

export default function UseStateDemo() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("World");

  return (
    <Demo
      title="State Hook"
      apis="useState"
      code={`const [count, setCount] = useState(0);
const [name, setName] = useState("World");

// Read as plain value
<span>Count: {count}</span>

// Set directly or with updater
setCount(5);
setCount(prev => prev + 1);`}
    >
      <p>
        Count: <strong>{count}</strong> | Name: <strong>{name}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => setCount((c) => c + 1)}>
          Increment
        </button>
        <button type="button" onClick={() => setCount((c) => c - 1)}>
          Decrement
        </button>
        <button type="button" onClick={() => setCount(0)}>
          Reset
        </button>
      </div>
      <div class="row">
        <input
          type="text"
          value="World"
          onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
        />
      </div>
    </Demo>
  );
}

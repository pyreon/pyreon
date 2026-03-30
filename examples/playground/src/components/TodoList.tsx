import { For } from "@pyreon/core";
import { computed, signal } from "@pyreon/reactivity";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export function TodoList() {
  const todos = signal<Todo[]>([
    { id: 1, text: "Build Pyreon framework", done: true },
    { id: 2, text: "Write tests", done: true },
    { id: 3, text: "Build the playground", done: false },
  ]);
  const input = signal("");

  const remaining = computed(() => todos().filter((t) => !t.done).length);

  const addTodo = () => {
    const text = input().trim();
    if (!text) return;
    todos.update((list) => [...list, { id: Date.now(), text, done: false }]);
    input.set("");
  };

  const toggle = (id: number) => {
    todos.update((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const remove = (id: number) => {
    todos.update((list) => list.filter((t) => t.id !== id));
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") addTodo();
  };

  return (
    <div class="card">
      <h2>Todo List</h2>
      <p class="remaining">{() => remaining()} remaining</p>

      <div class="input-row">
        <input
          type="text"
          placeholder="Add a todo…"
          value={() => input()}
          onInput={(e) => input.set(e.currentTarget.value)}
          onKeyDown={handleKey}
        />
        <button type="button" onClick={addTodo}>
          Add
        </button>
      </div>

      <ul class="todo-list">
        <For each={todos} by={(todo) => todo.id}>
          {(todo) => (
            <li class={todo.done ? "done" : ""}>
              <input type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)} />
              <span>{todo.text}</span>
              <button type="button" class="remove" onClick={() => remove(todo.id)}>
                ×
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

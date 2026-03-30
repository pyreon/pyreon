/**
 * List item component with props and event handling.
 *
 * PATTERNS:
 *   - Props interface for component typing
 *   - RouterLink for navigation
 *   - Signal for local toggle state
 *   - Event handler as plain function
 */
import { signal } from "@pyreon/reactivity";
import { RouterLink } from "@pyreon/router";

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

export const TodoItem = (props: { todo: Todo }) => {
  const checked = signal(props.todo.completed);

  const toggle = () => {
    checked.update((v) => !v);
    // In a real app: persist to server
  };

  return (
    <li class={checked() ? "completed" : ""}>
      <input type="checkbox" checked={checked()} onInput={toggle} />
      <RouterLink to={`/todo/${props.todo.id}`}>{props.todo.title}</RouterLink>
    </li>
  );
};

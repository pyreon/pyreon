/** A plain todo — the cross-framework state shape used for scenario setup. */
export interface Todo {
  id: number
  text: string
  done: boolean
}

export type Filter = 'all' | 'active' | 'completed'

/**
 * The contract every framework port implements. Each method performs the
 * idiomatic state mutation for that framework; `commit()` resolves once the
 * framework has flushed that mutation to the DOM (synchronous frameworks
 * resolve immediately, React waits for its DefaultLane commit). The harness
 * times `act()` + `commit()` as one region, then DOM-verifies.
 *
 * Idiomatic-per-framework is a fairness requirement: Pyreon uses fine-grained
 * signals (toggle updates only the changed rows' checkboxes — no list
 * reconciliation), React uses `useState<Todo[]>` + `memo` (whole-list
 * re-render). The benchmark measures those real shapes, not a forced common
 * pattern.
 */
export interface TodoApp {
  readonly name: string
  /** Mount an empty list into `container`; resolves once the framework is
   *  ready to accept mutations (React's first commit may be async). */
  mount(container: HTMLElement): void | Promise<void>
  /** Replace the whole list (untimed scenario setup). */
  seed(todos: Todo[]): void
  /** Append one todo. */
  addOne(text: string): void
  /** Set every todo's done flag. */
  toggleAll(done: boolean): void
  /** Remove every completed todo. */
  clearCompleted(): void
  /** Change the active filter. */
  setFilter(f: Filter): void
  /** Resolve once the last mutation is committed to the DOM. */
  commit(): Promise<void>
  /** Tear down + remove all DOM. */
  unmount(): void
}

export type AppFactory = () => TodoApp

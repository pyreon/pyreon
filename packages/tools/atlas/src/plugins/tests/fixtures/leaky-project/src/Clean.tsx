/** The control: creates reactive state and disposes with the component. */
import { signal } from '@pyreon/reactivity'

export function Clean(props: { label?: string }): string {
  const n = signal(1)
  void props
  return String(n())
}

import { useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { Theme } from '../theme'

export default function Counter() {
  const count = signal(0)
  const theme = useContext(Theme)
  return (
    <button type="button" data-testid="counter" onClick={() => count.set(count() + 1)}>
      {theme}:{count()}
    </button>
  )
}

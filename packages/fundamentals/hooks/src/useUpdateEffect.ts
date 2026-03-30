import { onUnmount } from '@pyreon/core'
import { watch } from '@pyreon/reactivity'

export type UseUpdateEffect = <T>(
  source: () => T,
  callback: (newVal: T, oldVal: T | undefined) => undefined | (() => void),
) => void

/**
 * Like `effect` but skips the initial value — only fires on updates.
 *
 * In Pyreon, this is implemented using `watch()` which already skips
 * the initial value by default (immediate defaults to false).
 *
 * @param source - A reactive getter to watch
 * @param callback - Called when source changes, receives (newVal, oldVal)
 */
export const useUpdateEffect: UseUpdateEffect = (source, callback) => {
  const stop = watch(source, callback)

  onUnmount(() => stop())
}

export default useUpdateEffect

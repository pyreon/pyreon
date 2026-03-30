import { computed } from '@pyreon/reactivity'
import type { KeyOf, ReadableSignal } from './types'
import { isSignal, resolveKey } from './types'

function reactive<TIn, TOut>(source: TIn, fn: (val: any) => TOut): any {
  if (isSignal(source)) return computed(() => fn((source as ReadableSignal<any>)()))
  return fn(source)
}

/** Count items in collection. */
export function count<T>(source: ReadableSignal<T[]>): ReturnType<typeof computed<number>>
export function count<T>(source: T[]): number
export function count<T>(source: ReadableSignal<T[]> | T[]): any {
  return reactive(source, (arr: T[]) => arr.length)
}

/** Sum numeric values. Optionally by key. */
export function sum<T>(
  source: ReadableSignal<T[]>,
  key?: KeyOf<T>,
): ReturnType<typeof computed<number>>
export function sum<T>(source: T[], key?: KeyOf<T>): number
export function sum<T>(source: ReadableSignal<T[]> | T[], key?: KeyOf<T>): any {
  const getVal = key ? resolveKey(key) : (item: T) => item as unknown as number
  return reactive(source, (arr: T[]) => arr.reduce((acc, item) => acc + Number(getVal(item)), 0))
}

/** Find minimum item. Optionally by key. */
export function min<T>(
  source: ReadableSignal<T[]>,
  key?: KeyOf<T>,
): ReturnType<typeof computed<T | undefined>>
export function min<T>(source: T[], key?: KeyOf<T>): T | undefined
export function min<T>(source: ReadableSignal<T[]> | T[], key?: KeyOf<T>): any {
  const getVal = key ? resolveKey(key) : (item: T) => item as unknown as number
  return reactive(source, (arr: T[]) => {
    if (arr.length === 0) return undefined
    let result = arr[0] as T
    let minVal = Number(getVal(result))
    for (let i = 1; i < arr.length; i++) {
      const val = Number(getVal(arr[i] as T))
      if (val < minVal) {
        minVal = val
        result = arr[i] as T
      }
    }
    return result
  })
}

/** Find maximum item. Optionally by key. */
export function max<T>(
  source: ReadableSignal<T[]>,
  key?: KeyOf<T>,
): ReturnType<typeof computed<T | undefined>>
export function max<T>(source: T[], key?: KeyOf<T>): T | undefined
export function max<T>(source: ReadableSignal<T[]> | T[], key?: KeyOf<T>): any {
  const getVal = key ? resolveKey(key) : (item: T) => item as unknown as number
  return reactive(source, (arr: T[]) => {
    if (arr.length === 0) return undefined
    let result = arr[0] as T
    let maxVal = Number(getVal(result))
    for (let i = 1; i < arr.length; i++) {
      const val = Number(getVal(arr[i] as T))
      if (val > maxVal) {
        maxVal = val
        result = arr[i] as T
      }
    }
    return result
  })
}

/** Average of numeric values. Optionally by key. */
export function average<T>(
  source: ReadableSignal<T[]>,
  key?: KeyOf<T>,
): ReturnType<typeof computed<number>>
export function average<T>(source: T[], key?: KeyOf<T>): number
export function average<T>(source: ReadableSignal<T[]> | T[], key?: KeyOf<T>): any {
  const getVal = key ? resolveKey(key) : (item: T) => item as unknown as number
  return reactive(source, (arr: T[]) => {
    if (arr.length === 0) return 0
    return arr.reduce((acc, item) => acc + Number(getVal(item)), 0) / arr.length
  })
}

export const omit = <T extends Record<string, any>>(
  obj: T | null | undefined,
  keys?: readonly (string | keyof T)[],
): Partial<T> => {
  if (obj == null) return {} as Partial<T>
  if (!keys || keys.length === 0) return { ...obj }
  const result: Record<string, any> = {}
  const keysSet = new Set(keys as readonly string[])
  for (const key in obj) {
    if (Object.hasOwn(obj, key) && !keysSet.has(key)) {
      result[key] = obj[key]
    }
  }
  return result as Partial<T>
}

export const pick = <T extends Record<string, any>>(
  obj: T | null | undefined,
  keys?: readonly (string | keyof T)[],
): Partial<T> => {
  if (obj == null) return {} as Partial<T>
  if (!keys || keys.length === 0) return { ...obj }
  const result: Record<string, any> = {}
  for (const key of keys) {
    const k = key as string
    if (Object.hasOwn(obj, k)) {
      result[k] = obj[k]
    }
  }
  return result as Partial<T>
}

const PATH_RE = /[^.[\]]+/g

const parsePath = (path: string | string[]): string[] => {
  if (Array.isArray(path)) return path
  const parts = path.match(PATH_RE)
  return parts ?? []
}

const isUnsafeKey = (key: string): boolean =>
  key === '__proto__' || key === 'prototype' || key === 'constructor'

export const get = (obj: any, path: string | string[], defaultValue?: any): any => {
  const keys = parsePath(path)
  let result = obj
  for (const key of keys) {
    if (result == null || isUnsafeKey(key)) return defaultValue
    result = result[key]
  }
  return result === undefined ? defaultValue : result
}

export const set = (
  obj: Record<string, any>,
  path: string | string[],
  value: any,
): Record<string, any> => {
  const keys = parsePath(path)
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i] as string
    if (isUnsafeKey(key)) return obj
    const nextKey = keys[i + 1] as string
    if (isUnsafeKey(nextKey)) return obj
    if (current[key] == null) {
      current[key] = /^\d+$/.test(nextKey) ? [] : {}
    }
    current = current[key]
  }
  const lastKey = keys[keys.length - 1]
  if (lastKey != null && !isUnsafeKey(lastKey)) {
    current[lastKey] = value
  }
  return obj
}

export const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  wait: number = 0,
  options?: { leading?: boolean; trailing?: boolean },
): T & { cancel: () => void } => {
  const leading = options?.leading !== false
  const trailing = options?.trailing !== false
  let lastCallTime: number | undefined
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let lastArgs: any[] | undefined

  const invoke = (args: any[]) => {
    lastCallTime = Date.now()
    fn(...args)
  }

  const startTrailingTimer = (args: any[], delay: number) => {
    lastArgs = args
    if (timeoutId !== undefined) return
    timeoutId = setTimeout(() => {
      timeoutId = undefined
      if (lastArgs) {
        invoke(lastArgs)
        lastArgs = undefined
      }
    }, delay)
  }

  const throttled = (...args: any[]) => {
    const now = Date.now()
    const elapsed = lastCallTime === undefined ? wait : now - lastCallTime
    if (elapsed >= wait) {
      if (leading) {
        invoke(args)
      } else {
        lastCallTime = now
        if (trailing) startTrailingTimer(args, wait)
      }
    } else if (trailing) {
      startTrailingTimer(args, wait - elapsed)
    }
  }

  throttled.cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }
    lastArgs = undefined
    lastCallTime = undefined
  }

  return throttled as T & { cancel: () => void }
}

const isPlainObject = (value: unknown): value is Record<string, any> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype

export const merge = <T extends Record<string, any>>(
  target: T,
  ...sources: Record<string, any>[]
): T => {
  for (const source of sources) {
    if (source == null) continue
    for (const key of Object.keys(source)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      const targetVal = (target as Record<string, unknown>)[key]
      const sourceVal = source[key]
      if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
        ;(target as Record<string, unknown>)[key] = merge({ ...targetVal }, sourceVal)
      } else {
        ;(target as Record<string, unknown>)[key] = sourceVal
      }
    }
  }
  return target
}

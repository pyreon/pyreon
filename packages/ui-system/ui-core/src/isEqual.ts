const isArrayEqual = (a: unknown[], b: unknown[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!isEqual(a[i], b[i])) return false
  }
  return true
}

const isObjectEqual = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  for (const key of aKeys) {
    if (!Object.hasOwn(b, key)) return false
    if (!isEqual(a[key], b[key])) return false
  }
  return true
}

const isEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b || a == null || b == null || typeof a !== 'object') return false
  if (Array.isArray(a)) return Array.isArray(b) && isArrayEqual(a, b)
  if (Array.isArray(b)) return false
  return isObjectEqual(a as Record<string, unknown>, b as Record<string, unknown>)
}

export default isEqual

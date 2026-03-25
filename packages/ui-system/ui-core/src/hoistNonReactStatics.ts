const KNOWN_STATICS: Record<string, true> = {
  name: true,
  length: true,
  prototype: true,
  caller: true,
  callee: true,
  arguments: true,
  arity: true,
}

const COMPONENT_STATICS: Record<string, true> = {
  displayName: true,
  defaultProps: true,
}

/**
 * Copies non-framework static properties from a source component to a target.
 *
 * Pyreon equivalent of hoistNonReactStatics — simplified since Pyreon
 * components are plain functions without React-specific statics like
 * contextType, propTypes, getDerivedStateFromProps, etc.
 */
const hoistNonReactStatics = <T, S>(
  target: T,
  source: S,
  excludeList?: Record<string, true>,
): T => {
  if (typeof source === "string") return target

  const proto = Object.getPrototypeOf(source)
  if (proto && proto !== Object.prototype) {
    hoistNonReactStatics(target, proto, excludeList)
  }

  const keys: (string | symbol)[] = [
    ...Object.getOwnPropertyNames(source),
    ...Object.getOwnPropertySymbols(source),
  ]

  for (const key of keys) {
    const k = key as string
    if (KNOWN_STATICS[k] || excludeList?.[k] || COMPONENT_STATICS[k]) {
      continue
    }

    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    if (descriptor) {
      try {
        Object.defineProperty(target, key, descriptor)
      } catch {
        // Silently skip non-configurable properties
      }
    }
  }

  return target
}

export default hoistNonReactStatics

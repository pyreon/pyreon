/**
 * @pyreon/form devtools introspection API.
 * Import: `import { ... } from "@pyreon/form/devtools"`
 */

const _activeForms = new Map<string, WeakRef<object>>()
const _listeners = new Set<() => void>()

function _notify(): void {
  for (const listener of _listeners) listener()
}

/**
 * Register a form instance for devtools inspection.
 *
 * @example
 * const form = useForm({ ... })
 * registerForm("login-form", form)
 */
export function registerForm(name: string, form: object): void {
  _activeForms.set(name, new WeakRef(form))
  _notify()
}

/** Unregister a form instance. */
export function unregisterForm(name: string): void {
  _activeForms.delete(name)
  _notify()
}

/** Get all registered form names. Cleans up garbage-collected instances. */
export function getActiveForms(): string[] {
  for (const [name, ref] of _activeForms) {
    if (ref.deref() === undefined) _activeForms.delete(name)
  }
  return [..._activeForms.keys()]
}

/** Get a form instance by name (or undefined if GC'd or not registered). */
export function getFormInstance(name: string): object | undefined {
  const ref = _activeForms.get(name)
  if (!ref) return undefined
  const instance = ref.deref()
  if (!instance) {
    _activeForms.delete(name)
    return undefined
  }
  return instance
}

/**
 * Get a snapshot of a registered form's current state.
 * Returns values, errors, and form-level status signals.
 */
export function getFormSnapshot(name: string): Record<string, unknown> | undefined {
  const form = getFormInstance(name) as Record<string, unknown> | undefined
  if (!form) return undefined
  return {
    values: typeof form.values === "function" ? (form.values as () => unknown)() : undefined,
    errors: typeof form.errors === "function" ? (form.errors as () => unknown)() : undefined,
    isSubmitting:
      typeof form.isSubmitting === "function" ? (form.isSubmitting as () => unknown)() : undefined,
    isValid: typeof form.isValid === "function" ? (form.isValid as () => unknown)() : undefined,
    isDirty: typeof form.isDirty === "function" ? (form.isDirty as () => unknown)() : undefined,
    submitCount:
      typeof form.submitCount === "function" ? (form.submitCount as () => unknown)() : undefined,
  }
}

/** Subscribe to form registry changes. Returns unsubscribe function. */
export function onFormChange(listener: () => void): () => void {
  _listeners.add(listener)
  return () => {
    _listeners.delete(listener)
  }
}

/** @internal — reset devtools registry (for tests). */
export function _resetDevtools(): void {
  _activeForms.clear()
  _listeners.clear()
}

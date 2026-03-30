/**
 * @pyreon/i18n devtools introspection API.
 * Import: `import { ... } from "@pyreon/i18n/devtools"`
 */

const _activeInstances = new Map<string, WeakRef<object>>();
const _listeners = new Set<() => void>();

function _notify(): void {
  for (const listener of _listeners) listener();
}

/**
 * Register an i18n instance for devtools inspection.
 *
 * @example
 * const i18n = createI18n({ ... })
 * registerI18n("app", i18n)
 */
export function registerI18n(name: string, instance: object): void {
  _activeInstances.set(name, new WeakRef(instance));
  _notify();
}

/** Unregister an i18n instance. */
export function unregisterI18n(name: string): void {
  _activeInstances.delete(name);
  _notify();
}

/** Get all registered i18n instance names. Cleans up garbage-collected instances. */
export function getActiveI18nInstances(): string[] {
  for (const [name, ref] of _activeInstances) {
    if (ref.deref() === undefined) _activeInstances.delete(name);
  }
  return [..._activeInstances.keys()];
}

/** Get an i18n instance by name (or undefined if GC'd or not registered). */
export function getI18nInstance(name: string): object | undefined {
  const ref = _activeInstances.get(name);
  if (!ref) return undefined;
  const instance = ref.deref();
  if (!instance) {
    _activeInstances.delete(name);
    return undefined;
  }
  return instance;
}

/** Safely read a property that may be a signal (callable). */
function safeRead(
  obj: Record<string, unknown>,
  key: string,
  fallback: unknown = undefined,
): unknown {
  try {
    const val = obj[key];
    return typeof val === "function" ? (val as () => unknown)() : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Get a snapshot of an i18n instance's state.
 */
export function getI18nSnapshot(name: string): Record<string, unknown> | undefined {
  const instance = getI18nInstance(name) as Record<string, unknown> | undefined;
  if (!instance) return undefined;
  const ns = safeRead(instance, "loadedNamespaces", new Set());
  return {
    locale: safeRead(instance, "locale"),
    availableLocales: safeRead(instance, "availableLocales", []),
    loadedNamespaces: ns instanceof Set ? [...ns] : [],
    isLoading: safeRead(instance, "isLoading", false),
  };
}

/** Subscribe to i18n registry changes. Returns unsubscribe function. */
export function onI18nChange(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/** @internal — reset devtools registry (for tests). */
export function _resetDevtools(): void {
  _activeInstances.clear();
  _listeners.clear();
}

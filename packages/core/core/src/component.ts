import { setCurrentHooks } from "./lifecycle";
import type { ComponentFn, LifecycleHooks, Props, VNodeChild } from "./types";

/**
 * Identity wrapper — marks a function as a Pyreon component and preserves its type.
 * Useful for IDE tooling and future compiler optimisations.
 */
export function defineComponent<P extends Props>(fn: ComponentFn<P>): ComponentFn<P> {
  return fn;
}

/**
 * Run a component function in a tracked context so that lifecycle hooks
 * registered inside it (onMount, onUnmount, onErrorCaptured, etc.) are captured.
 *
 * Called by the renderer — not intended for user code.
 */
export function runWithHooks<P extends Props>(
  fn: ComponentFn<P>,
  props: P,
): { vnode: VNodeChild; hooks: LifecycleHooks } {
  const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
  setCurrentHooks(hooks);
  let vnode: VNodeChild = null;
  try {
    vnode = fn(props);
  } finally {
    setCurrentHooks(null);
  }
  return { vnode, hooks };
}

/**
 * Walk up error handlers collected during component rendering.
 * Returns true if any handler marked the error as handled.
 */
export function propagateError(err: unknown, hooks: LifecycleHooks): boolean {
  for (const handler of hooks.error) {
    if (handler(err) === true) return true;
  }
  return false;
}

// ─── Error boundary stack ────────────────────────────────────────────────────
// Module-level stack of active ErrorBoundary handlers (innermost last).
// ErrorBoundary pushes during its own setup (before children mount) so that
// any child mountComponent error can dispatch up to the nearest boundary.

const _errorBoundaryStack: ((err: unknown) => boolean)[] = [];

export function pushErrorBoundary(handler: (err: unknown) => boolean): void {
  _errorBoundaryStack.push(handler);
}

export function popErrorBoundary(): void {
  _errorBoundaryStack.pop();
}

/**
 * Dispatch an error to the nearest active ErrorBoundary.
 * Returns true if the boundary handled it, false if none was registered.
 */
export function dispatchToErrorBoundary(err: unknown): boolean {
  const handler = _errorBoundaryStack[_errorBoundaryStack.length - 1];
  return handler ? handler(err) : false;
}

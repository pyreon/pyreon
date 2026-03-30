import type { VNodeChild } from "@pyreon/core";
/**
 * @pyreon/react-compat/dom
 *
 * Drop-in for `react-dom/client` — provides `createRoot` so you can keep
 * the same entry-point pattern as a React app.
 */
import { mount } from "@pyreon/runtime-dom";

/**
 * Drop-in for React 18's `createRoot(container).render(element)`.
 *
 * @example
 * import { createRoot } from "@pyreon/react-compat/dom"
 * createRoot(document.getElementById("app")!).render(<App />)
 */
export function createRoot(container: Element): {
  render: (element: VNodeChild) => void;
  unmount: () => void;
} {
  let cleanup: (() => void) | null = null;
  return {
    render(element: VNodeChild) {
      if (cleanup) cleanup();
      cleanup = mount(element, container as HTMLElement);
    },
    unmount() {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    },
  };
}

/** Alias — matches React 17's `render(element, container)` signature. */
export function render(element: VNodeChild, container: Element): void {
  mount(element, container as HTMLElement);
}

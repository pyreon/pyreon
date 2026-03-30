import type { Props, VNodeChild } from "@pyreon/core";
import { createRef, h, onMount } from "@pyreon/core";
import { effect } from "@pyreon/reactivity";
import { mountChild } from "./mount";

export interface KeepAliveProps extends Props {
  /**
   * Accessor that returns true when this slot's children should be visible.
   * When false, children are CSS-hidden but remain mounted — effects and
   * signals stay alive.
   * Defaults to true (always visible / always mounted).
   */
  active?: () => boolean;
  children?: VNodeChild;
}

/**
 * KeepAlive — mounts its children once and keeps them alive even when hidden.
 *
 * Unlike conditional rendering (which destroys and recreates component state),
 * KeepAlive CSS-hides the children while preserving all reactive state,
 * scroll position, form values, and in-flight async operations.
 *
 * Children are mounted imperatively on first activation and are never unmounted
 * while the KeepAlive itself is mounted.
 *
 * Multi-slot pattern (one KeepAlive per route):
 * @example
 * h(Fragment, null, [
 *   h(KeepAlive, { active: () => route() === "/a" }, h(RouteA, null)),
 *   h(KeepAlive, { active: () => route() === "/b" }, h(RouteB, null)),
 * ])
 *
 * With JSX:
 * @example
 * <>
 *   <KeepAlive active={() => route() === "/a"}><RouteA /></KeepAlive>
 *   <KeepAlive active={() => route() === "/b"}><RouteB /></KeepAlive>
 * </>
 */
export function KeepAlive(props: KeepAliveProps): VNodeChild {
  const containerRef = createRef<HTMLElement>();
  let childCleanup: (() => void) | null = null;
  let childMounted = false;

  onMount(() => {
    const container = containerRef.current;
    if (!container) return;

    const e = effect(() => {
      const isActive = props.active?.() ?? true;

      if (!childMounted) {
        // Mount children into the container div exactly once
        childCleanup = mountChild(props.children ?? null, container, null);
        childMounted = true;
      }

      // Show/hide without unmounting — state is fully preserved
      container.style.display = isActive ? "" : "none";
    });

    return () => {
      e.dispose();
      childCleanup?.();
    };
  });

  // `display: contents` makes the wrapper transparent to layout
  // (children appear as if directly in the parent flow)
  return h("div", { ref: containerRef, style: "display: contents" });
}

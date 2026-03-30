import type { VNode } from "@pyreon/core";
import { h } from "@pyreon/core";
import type { CSSProperties, TransitionCallbacks } from "../types";
import { cloneVNode } from "../utils";
import TransitionItem from "./TransitionItem";
import type { KineticConfig } from "./types";

type StaggerRendererProps = {
  config: KineticConfig;
  htmlProps: Record<string, unknown>;
  show: () => boolean;
  appear?: boolean | undefined;
  timeout?: number | undefined;
  interval?: number | undefined;
  reverseLeave?: boolean | undefined;
  callbacks: Partial<TransitionCallbacks>;
  children: VNode[];
};

const isVNode = (child: unknown): child is VNode =>
  child != null && typeof child === "object" && "type" in (child as object);

/**
 * Renders children with staggered enter/exit animation.
 * config.tag wraps the staggered children as a container element.
 * Each child is individually animated via TransitionItem.
 */
const StaggerRenderer = ({
  config,
  htmlProps,
  show,
  appear,
  timeout,
  interval,
  reverseLeave,
  callbacks,
  children,
}: StaggerRendererProps): VNode | null => {
  const effectiveAppear = appear ?? config.appear ?? false;
  const effectiveTimeout = timeout ?? config.timeout ?? 5000;
  const effectiveInterval = interval ?? config.interval ?? 50;
  const effectiveReverseLeave = reverseLeave ?? config.reverseLeave ?? false;

  const childArray = (Array.isArray(children) ? children : [children]).filter(isVNode);
  const count = childArray.length;

  const staggeredChildren = childArray.map((child, index) => {
    const staggerIndex = !show() && effectiveReverseLeave ? count - 1 - index : index;
    const delay = staggerIndex * effectiveInterval;

    return (
      <TransitionItem
        key={(child as VNode & { key?: string | number }).key ?? index}
        show={show}
        appear={effectiveAppear}
        timeout={effectiveTimeout + delay}
        enterStyle={config.enterStyle}
        enterToStyle={config.enterToStyle}
        enterTransition={config.enterTransition}
        leaveStyle={config.leaveStyle}
        leaveToStyle={config.leaveToStyle}
        leaveTransition={config.leaveTransition}
        enter={config.enter}
        enterFrom={config.enterFrom}
        enterTo={config.enterTo}
        leave={config.leave}
        leaveFrom={config.leaveFrom}
        leaveTo={config.leaveTo}
        onAfterLeave={
          index === (effectiveReverseLeave ? 0 : count - 1) ? callbacks.onAfterLeave : undefined
        }
      >
        {cloneVNode(child, {
          style: {
            ...((child.props as Record<string, unknown>)?.style as CSSProperties | undefined),
            "--stagger-index": staggerIndex,
            "--stagger-interval": `${effectiveInterval}ms`,
            transitionDelay: `${delay}ms`,
          } as CSSProperties,
        })}
      </TransitionItem>
    );
  });

  return h(config.tag, { ...htmlProps }, ...staggeredChildren);
};

export default StaggerRenderer;

import type { VNode } from "@pyreon/core";
import type { CSSProperties, TransitionCallbacks } from "../types";
import CollapseRenderer from "./CollapseRenderer";
import GroupRenderer from "./GroupRenderer";
import StaggerRenderer from "./StaggerRenderer";
import TransitionRenderer from "./TransitionRenderer";
import type { ClassConfig, KineticComponent, KineticConfig, KineticMode } from "./types";

/** Keys that are kinetic-specific and should not be forwarded as HTML attrs. */
const KINETIC_KEYS = new Set([
  "show",
  "appear",
  "unmount",
  "timeout",
  "transition",
  "interval",
  "reverseLeave",
  "onEnter",
  "onAfterEnter",
  "onLeave",
  "onAfterLeave",
]);

/**
 * Core factory. Creates a component that delegates to the appropriate
 * renderer based on config.mode, then attaches immutable chain methods
 * via Object.assign.
 */
const createKineticComponent = <Tag extends string, Mode extends KineticMode = "transition">(
  config: KineticConfig,
): KineticComponent<Tag, Mode> => {
  const Component = (props: Record<string, unknown>): VNode | null => {
    // Separate kinetic-specific props from HTML pass-through props
    const htmlProps: Record<string, unknown> = {};
    const kineticProps: Record<string, unknown> = {};

    for (const key in props) {
      if (KINETIC_KEYS.has(key)) {
        kineticProps[key] = props[key];
      } else {
        htmlProps[key] = props[key];
      }
    }

    const {
      show,
      appear,
      unmount,
      timeout,
      transition,
      interval,
      reverseLeave,
      onEnter,
      onAfterEnter,
      onLeave,
      onAfterLeave,
    } = kineticProps as {
      show?: () => boolean;
      appear?: boolean;
      unmount?: boolean;
      timeout?: number;
      transition?: string;
      interval?: number;
      reverseLeave?: boolean;
    } & Partial<TransitionCallbacks>;

    const callbacks: Partial<TransitionCallbacks> = {
      onEnter: onEnter ?? config.onEnter,
      onAfterEnter: onAfterEnter ?? config.onAfterEnter,
      onLeave: onLeave ?? config.onLeave,
      onAfterLeave: onAfterLeave ?? config.onAfterLeave,
    };

    // Extract children from htmlProps (it's not an HTML attribute)
    const { children, ...restHtml } = htmlProps;

    if (config.mode === "collapse") {
      return (
        <CollapseRenderer
          config={config}
          htmlProps={restHtml}
          show={show as () => boolean}
          appear={appear}
          timeout={timeout}
          transition={transition}
          callbacks={callbacks}
        >
          {children as VNode | VNode[]}
        </CollapseRenderer>
      );
    }

    if (config.mode === "stagger") {
      return (
        <StaggerRenderer
          config={config}
          htmlProps={restHtml}
          show={show as () => boolean}
          appear={appear}
          timeout={timeout}
          interval={interval}
          reverseLeave={reverseLeave}
          callbacks={callbacks}
        >
          {children as VNode[]}
        </StaggerRenderer>
      );
    }

    if (config.mode === "group") {
      return (
        <GroupRenderer
          config={config}
          htmlProps={restHtml}
          appear={appear}
          timeout={timeout}
          callbacks={callbacks}
        >
          {children as VNode[]}
        </GroupRenderer>
      );
    }

    // Default: transition mode
    return (
      <TransitionRenderer
        config={config}
        htmlProps={restHtml}
        show={show as () => boolean}
        appear={appear}
        unmount={unmount}
        timeout={timeout}
        callbacks={callbacks}
      >
        {children as VNode | VNode[]}
      </TransitionRenderer>
    );
  };

  Component.displayName = `kinetic(${config.tag})`;

  // Immutable chain methods — each returns a new component with merged config.
  return Object.assign(Component, {
    preset: (preset: Record<string, unknown>) =>
      createKineticComponent<Tag, Mode>({
        ...config,
        ...preset,
      } as KineticConfig),

    enter: (styles: CSSProperties) =>
      createKineticComponent<Tag, Mode>({ ...config, enterStyle: styles }),

    enterTo: (styles: CSSProperties) =>
      createKineticComponent<Tag, Mode>({ ...config, enterToStyle: styles }),

    enterTransition: (value: string) =>
      createKineticComponent<Tag, Mode>({ ...config, enterTransition: value }),

    leave: (styles: CSSProperties) =>
      createKineticComponent<Tag, Mode>({ ...config, leaveStyle: styles }),

    leaveTo: (styles: CSSProperties) =>
      createKineticComponent<Tag, Mode>({ ...config, leaveToStyle: styles }),

    leaveTransition: (value: string) =>
      createKineticComponent<Tag, Mode>({ ...config, leaveTransition: value }),

    enterClass: ({ active, from, to }: ClassConfig) =>
      createKineticComponent<Tag, Mode>({
        ...config,
        enter: active,
        enterFrom: from,
        enterTo: to,
      }),

    leaveClass: ({ active, from, to }: ClassConfig) =>
      createKineticComponent<Tag, Mode>({
        ...config,
        leave: active,
        leaveFrom: from,
        leaveTo: to,
      }),

    config: (opts: Record<string, unknown>) =>
      createKineticComponent<Tag, Mode>({
        ...config,
        ...opts,
      } as KineticConfig),

    on: (cbs: Partial<TransitionCallbacks>) =>
      createKineticComponent<Tag, Mode>({ ...config, ...cbs }),

    collapse: (opts?: { transition?: string }) =>
      createKineticComponent<Tag, "collapse">({
        ...config,
        mode: "collapse",
        ...opts,
      }),

    stagger: (opts?: { interval?: number; reverseLeave?: boolean }) =>
      createKineticComponent<Tag, "stagger">({
        ...config,
        mode: "stagger",
        ...opts,
      }),

    group: () => createKineticComponent<Tag, "group">({ ...config, mode: "group" }),
  }) as unknown as KineticComponent<Tag, Mode>;
};

export default createKineticComponent;

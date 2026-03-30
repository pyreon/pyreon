import { render } from "@pyreon/ui-core";
import { useTheme } from "../hooks";
import type { Configuration } from "../types/configuration";
import type { ComponentFn } from "../types/utils";
import { calculateChainOptions, removeUndefinedProps } from "../utils/attrs";

export type RocketStyleHOC = ({
  inversed,
  attrs,
  priorityAttrs,
}: Pick<Configuration, "inversed" | "attrs" | "priorityAttrs">) => (
  WrappedComponent: ComponentFn<any>,
) => ComponentFn<any>;

/**
 * HOC that resolves the `.attrs()` chain before the inner component renders.
 * Evaluates both regular and priority attrs callbacks with the current theme
 * and mode, then merges the results with explicit props (priority attrs
 * are applied first, regular attrs can be overridden by direct props).
 *
 * In Pyreon, there is no forwardRef — ref flows as a normal prop.
 * Components are plain functions.
 */
const rocketStyleHOC: RocketStyleHOC = ({ inversed, attrs, priorityAttrs }) => {
  const calculateAttrs = calculateChainOptions(attrs);
  const calculatePriorityAttrs = calculateChainOptions(priorityAttrs);

  const Enhanced = (WrappedComponent: ComponentFn<any>) => {
    const HOCComponent: ComponentFn<any> = (props) => {
      // IMPORTANT: Do NOT destructure — useTheme returns getter properties.
      // Destructuring calls getters once and captures static values.
      // Keep the object reference so properties re-evaluate lazily.
      const themeAttrs = useTheme({ inversed });

      // Remove undefined props not to override potential default props
      const filteredProps = removeUndefinedProps(props);

      // Reactive accessor — re-evaluates when mode changes.
      // Reading themeAttrs.mode inside the accessor creates a dependency
      // tracked by the runtime's effect (via mountReactive).
      // This ensures .attrs() callbacks see the current mode on mode switch.
      return (() => {
        const callbackParams = [
          themeAttrs.theme,
          { render, mode: themeAttrs.mode, isDark: themeAttrs.isDark, isLight: themeAttrs.isLight },
        ];

        const prioritizedAttrs = calculatePriorityAttrs([filteredProps, ...callbackParams]);

        const finalAttrs = calculateAttrs([
          {
            ...prioritizedAttrs,
            ...filteredProps,
          },
          ...callbackParams,
        ]);

        const finalProps = {
          ...prioritizedAttrs,
          ...finalAttrs,
          ...filteredProps,
        };

        return WrappedComponent(finalProps);
      }) as unknown as ReturnType<ComponentFn<any>>;
    };
    return HOCComponent;
  };

  return Enhanced;
};

export default rocketStyleHOC;

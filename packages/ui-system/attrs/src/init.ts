import { isEmpty } from "@pyreon/ui-core";
import attrsComponent from "./attrs";
import type { InitAttrsComponent } from "./types/InitAttrsComponent";
import type { ElementType } from "./types/utils";

/**
 * Public entry point for creating an attrs-enhanced component.
 *
 * ```tsx
 * const Button = attrs({ name: 'Button', component: Element })
 *   .attrs({ tag: 'button' })
 *   .attrs<{ primary?: boolean }>(({ primary }) => ({
 *     backgroundColor: primary ? 'blue' : 'gray',
 *   }))
 * ```
 */
export type Attrs = <C extends ElementType>({
  name,
  component,
}: {
  name: string;
  component: C;
}) => ReturnType<InitAttrsComponent<C>>;

const attrs: Attrs = ({ name, component }) => {
  // Validate required params in development — fail fast with clear errors.
  if (process.env.NODE_ENV !== "production") {
    type Errors = Partial<{
      component: string;
      name: string;
    }>;

    const errors: Errors = {};
    if (!component) {
      errors.component = "Parameter `component` is missing in params!";
    }

    if (!name) {
      errors.name = "Parameter `name` is missing in params!";
    }

    if (!isEmpty(errors)) {
      throw Error(JSON.stringify(errors));
    }
  }

  // Bootstrap with empty configuration — all chains start from scratch.
  return attrsComponent({
    name,
    component,
    attrs: [],
    priorityAttrs: [],
    filterAttrs: [],
    compose: {},
    statics: {},
  });
};

export default attrs;

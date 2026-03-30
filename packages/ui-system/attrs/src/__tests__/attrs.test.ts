import attrsComponent from "../attrs";
import attrs from "../init";
import isAttrsComponent from "../isAttrsComponent";

/**
 * Simple base component for testing.
 * Returns a VNode-like object so we can inspect the final props.
 */
const BaseComponent = (props: any) => ({
  type: "div",
  props: { ...props, "data-testid": "base" },
  children: props.children ?? props.label ?? null,
  key: null,
});

/** Helper: call the component and return its output for inspection. */
const renderProps = (Component: any, props: Record<string, any> = {}) => {
  const vnode = Component(props) as any;
  return vnode?.props ?? vnode;
};

// --------------------------------------------------------
// attrs() initialization
// --------------------------------------------------------
describe("attrs initialization", () => {
  it("should create an attrs component from a base component", () => {
    const Component = attrs({ name: "TestComponent", component: BaseComponent });
    expect(Component).toBeDefined();
    expect(Component.IS_ATTRS).toBe(true);
    expect(Component.displayName).toBe("TestComponent");
  });

  it("should throw when component is missing (dev mode)", () => {
    expect(() => attrs({ name: "Test", component: undefined as any })).toThrow();
  });

  it("should throw when name is missing (dev mode)", () => {
    expect(() => attrs({ name: undefined as any, component: BaseComponent })).toThrow();
  });

  it("should render the wrapped component", () => {
    const Component = attrs({ name: "Test", component: BaseComponent });
    const result = renderProps(Component, { label: "Hello" });
    expect(result.label).toBe("Hello");
  });

  it("should add data-attrs in development mode", () => {
    const Component = attrs({ name: "MyComponent", component: BaseComponent });
    const result = renderProps(Component);
    expect(result["data-attrs"]).toBe("MyComponent");
  });
});

// --------------------------------------------------------
// .attrs() chaining
// --------------------------------------------------------
describe(".attrs() chaining", () => {
  it("should apply default attrs to the component", () => {
    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    }).attrs(() => ({ label: "Default Label" }));

    const result = renderProps(Component);
    expect(result.label).toBe("Default Label");
  });

  it("should allow props to override default attrs", () => {
    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    }).attrs(() => ({ label: "Default" }));

    const result = renderProps(Component, { label: "Override" });
    expect(result.label).toBe("Override");
  });

  it("should support multiple .attrs() chains", () => {
    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    })
      .attrs(() => ({ "data-first": "yes" }))
      .attrs(() => ({ "data-second": "yes" }));

    const result = renderProps(Component);
    expect(result["data-first"]).toBe("yes");
    expect(result["data-second"]).toBe("yes");
  });

  it("should pass current props to attrs callback", () => {
    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    }).attrs((props: any) => ({
      "data-variant": props.variant === "primary" ? "is-primary" : "is-default",
    }));

    const result = renderProps(Component, { variant: "primary" });
    expect(result["data-variant"]).toBe("is-primary");
  });

  it("should support object-based attrs", () => {
    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    }).attrs({ label: "Static Label" });

    const result = renderProps(Component);
    expect(result.label).toBe("Static Label");
  });

  it("should support priority attrs", () => {
    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    })
      .attrs(() => ({ label: "Normal" }))
      .attrs(() => ({ label: "Priority" }), { priority: true });

    // Priority attrs have lower precedence than normal attrs
    const result = renderProps(Component);
    expect(result.label).toBe("Normal");
  });

  it("should support filter option to remove attrs from final props", () => {
    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    }).attrs(() => ({ label: "Visible" }), {
      filter: ["data-internal"],
    });

    const result = renderProps(Component, {
      "data-internal": "secret",
      label: "test",
    });
    expect(result["data-internal"]).toBeUndefined();
  });
});

// --------------------------------------------------------
// .config() chaining
// --------------------------------------------------------
describe(".config() chaining", () => {
  it("should return a new component instance", () => {
    const Original = attrs({ name: "Test", component: BaseComponent });
    const Configured = Original.config({});
    expect(Configured).not.toBe(Original);
    expect(Configured.IS_ATTRS).toBe(true);
  });

  it("should update displayName when name is changed", () => {
    const Original = attrs({ name: "Original", component: BaseComponent });
    const Renamed = Original.config({ name: "Renamed" });
    expect(Renamed.displayName).toBe("Renamed");
    expect(Original.displayName).toBe("Original");
  });

  it("should swap the rendered component", () => {
    const AltComponent = (props: any) => ({
      type: "span",
      props: { ...props, "data-testid": "alt" },
      children: props.label,
      key: null,
    });

    const Original = attrs({ name: "Test", component: BaseComponent });
    const Swapped = Original.config({ component: AltComponent });

    const result = Swapped({ label: "swapped" }) as any;
    expect(result.props["data-testid"]).toBe("alt");
    expect(result.children).toBe("swapped");
  });

  it("should preserve attrs chain after config swap", () => {
    const AltComponent = (props: any) => ({
      type: "span",
      props: { ...props, "data-testid": "alt" },
      children: props.label,
      key: null,
    });

    const Component = attrs({ name: "Test", component: BaseComponent })
      .attrs(() => ({ label: "from-attrs" }))
      .config({ component: AltComponent });

    const result = Component({}) as any;
    expect(result.children).toBe("from-attrs");
  });
});

// --------------------------------------------------------
// .statics() chaining
// --------------------------------------------------------
describe(".statics() chaining", () => {
  it("should assign statics to component meta", () => {
    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    }).statics({ theme: "dark", sizes: ["sm", "md", "lg"] });

    expect(Component.meta).toEqual({
      theme: "dark",
      sizes: ["sm", "md", "lg"],
    });
  });

  it("should merge statics across chains", () => {
    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    })
      .statics({ theme: "dark" })
      .statics({ variant: "primary" });

    expect(Component.meta).toEqual({
      theme: "dark",
      variant: "primary",
    });
  });
});

// --------------------------------------------------------
// .compose() chaining
// --------------------------------------------------------
describe(".compose() chaining", () => {
  it("should wrap component with a HOC", () => {
    const withWrapper = (WrappedComponent: any) => (props: any) => ({
      type: "div",
      props: { "data-testid": "hoc-wrapper" },
      children: WrappedComponent(props),
      key: null,
    });

    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    }).compose({ withWrapper });

    const result = Component({ label: "composed" }) as any;
    expect(result.props["data-testid"]).toBe("hoc-wrapper");
    expect(result.children.children).toBe("composed");
  });

  it("should apply multiple HOCs in correct order", () => {
    const order: string[] = [];

    const withOuter = (Wrapped: any) => (props: any) => {
      order.push("outer");
      return Wrapped(props);
    };

    const withInner = (Wrapped: any) => (props: any) => {
      order.push("inner");
      return Wrapped(props);
    };

    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    }).compose({ withOuter, withInner });

    Component({});
    // calculateHocsFuncs reverses the order: last-defined runs first
    expect(order).toEqual(["inner", "outer"]);
  });

  it("should remove a HOC by setting it to false", () => {
    const withWrapper = (WrappedComponent: any) => (props: any) => ({
      type: "div",
      props: { "data-testid": "hoc-wrapper" },
      children: WrappedComponent(props),
      key: null,
    });

    const WithHoc = attrs({
      name: "Test",
      component: BaseComponent,
    }).compose({ withWrapper });

    const WithoutHoc = WithHoc.compose({ withWrapper: false });

    const result = WithoutHoc({ label: "no-hoc" }) as any;
    // Should render base component directly, no wrapper
    expect(result.props["data-testid"]).toBe("base");
    expect(result.children).toBe("no-hoc");
  });
});

// --------------------------------------------------------
// .getDefaultAttrs()
// --------------------------------------------------------
describe(".getDefaultAttrs()", () => {
  it("should return computed default attrs for given props", () => {
    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    }).attrs((props: any) => ({
      computed: props.variant === "primary" ? "blue" : "gray",
    }));

    const defaults = Component.getDefaultAttrs({ variant: "primary" });
    expect(defaults).toEqual({ computed: "blue" });
  });

  it("should return empty object when no attrs defined", () => {
    const Component = attrs({ name: "Test", component: BaseComponent });
    const defaults = Component.getDefaultAttrs({});
    expect(defaults).toEqual({});
  });

  it("should merge multiple attrs chains", () => {
    const Component = attrs({
      name: "Test",
      component: BaseComponent,
    })
      .attrs(() => ({ color: "blue" }))
      .attrs(() => ({ size: "lg" }));

    const defaults = Component.getDefaultAttrs({});
    expect(defaults).toEqual({ color: "blue", size: "lg" });
  });
});

// --------------------------------------------------------
// isAttrsComponent
// --------------------------------------------------------
describe("isAttrsComponent", () => {
  it("should return true for attrs components", () => {
    const Component = attrs({ name: "Test", component: BaseComponent });
    expect(isAttrsComponent(Component)).toBe(true);
  });

  it("should return false for plain components", () => {
    expect(isAttrsComponent(BaseComponent)).toBe(false);
  });

  it("should return false for null", () => {
    expect(isAttrsComponent(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isAttrsComponent(undefined)).toBe(false);
  });

  it("should return false for non-objects", () => {
    expect(isAttrsComponent("string")).toBe(false);
    expect(isAttrsComponent(123)).toBe(false);
  });

  it("should return true for objects with IS_ATTRS property", () => {
    expect(isAttrsComponent({ IS_ATTRS: true })).toBe(true);
  });
});

// --------------------------------------------------------
// displayName fallback
// --------------------------------------------------------
describe("displayName resolution", () => {
  it("should fall back to component.displayName when name is not provided", () => {
    const NamedComponent = (props: any) => ({
      type: "div",
      props,
      children: props.children,
      key: null,
    });
    NamedComponent.displayName = "MyDisplayName";

    const Component = attrsComponent({
      name: undefined as any,
      component: NamedComponent,
      attrs: [],
      priorityAttrs: [],
      filterAttrs: [],
      compose: {},
      statics: {},
    });
    expect(Component.displayName).toBe("MyDisplayName");
  });

  it("should fall back to component.name when name and displayName are not provided", () => {
    function ExplicitNameComponent(props: any) {
      return {
        type: "div",
        props,
        children: props.children,
        key: null,
      };
    }

    const Component = attrsComponent({
      name: undefined as any,
      component: ExplicitNameComponent,
      attrs: [],
      priorityAttrs: [],
      filterAttrs: [],
      compose: {},
      statics: {},
    });
    expect(Component.displayName).toBe("ExplicitNameComponent");
  });
});

// --------------------------------------------------------
// Ref as normal prop
// --------------------------------------------------------
describe("ref passthrough", () => {
  it("should pass ref as a normal prop through the chain", () => {
    const Component = attrs({ name: "Test", component: BaseComponent });
    const refObj = { current: null };

    const result = renderProps(Component, { ref: refObj });
    expect(result.ref).toBe(refObj);
  });
});

// --------------------------------------------------------
// Immutability
// --------------------------------------------------------
describe("immutability", () => {
  it("should return new instances on each chain call", () => {
    const Base = attrs({ name: "Test", component: BaseComponent });
    const WithAttrs = Base.attrs(() => ({ label: "a" }));
    const WithStatics = Base.statics({ x: 1 });

    expect(Base).not.toBe(WithAttrs);
    expect(Base).not.toBe(WithStatics);
    expect(WithAttrs).not.toBe(WithStatics);
  });

  it("should not affect parent when child is modified", () => {
    const Parent = attrs({
      name: "Parent",
      component: BaseComponent,
    }).attrs(() => ({ label: "Parent" }));

    const Child = Parent.attrs(() => ({ label: "Child" }));

    const parentResult = renderProps(Parent);
    expect(parentResult.label).toBe("Parent");

    const childResult = renderProps(Child);
    expect(childResult.label).toBe("Child");
  });
});

// --------------------------------------------------------
// Deep chaining
// --------------------------------------------------------
describe("deep chaining", () => {
  it("should accumulate attrs across 3+ levels", () => {
    const Component = attrs({ name: "Test", component: BaseComponent })
      .attrs(() => ({ "data-a": "1" }))
      .attrs(() => ({ "data-b": "2" }))
      .attrs(() => ({ "data-c": "3" }));

    const result = renderProps(Component);
    expect(result["data-a"]).toBe("1");
    expect(result["data-b"]).toBe("2");
    expect(result["data-c"]).toBe("3");
  });

  it("should combine attrs, statics, and config in a single chain", () => {
    const Component = attrs({ name: "Base", component: BaseComponent })
      .attrs(() => ({ label: "hello" }))
      .statics({ variant: "primary" })
      .config({ name: "FinalName" })
      .attrs(() => ({ "data-extra": "yes" }));

    expect(Component.displayName).toBe("FinalName");
    expect(Component.meta).toEqual({ variant: "primary" });

    const result = renderProps(Component);
    expect(result.label).toBe("hello");
    expect(result["data-extra"]).toBe("yes");
  });

  it("should allow later attrs to override earlier ones", () => {
    const Component = attrs({ name: "Test", component: BaseComponent })
      .attrs(() => ({ label: "first" }))
      .attrs(() => ({ label: "second" }))
      .attrs(() => ({ label: "third" }));

    const result = renderProps(Component);
    expect(result.label).toBe("third");
  });
});

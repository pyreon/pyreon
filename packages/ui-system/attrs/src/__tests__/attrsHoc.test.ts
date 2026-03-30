import createAttrsHOC from "../hoc/attrsHoc";

const Receiver = (props: any) => ({
  type: "div",
  props: { ...props, "data-testid": "receiver" },
  children: props.label ?? "",
  key: null,
});

// --------------------------------------------------------
// attrsHoc - props merging
// --------------------------------------------------------
describe("attrsHoc - props merging", () => {
  it("should pass through props unchanged when no attrs defined", () => {
    const hoc = createAttrsHOC({ attrs: [], priorityAttrs: [] });
    const Enhanced = hoc(Receiver);

    const result = Enhanced({ label: "hello", "data-custom": "yes" }) as any;
    expect(result.children).toBe("hello");
    expect(result.props["data-custom"]).toBe("yes");
  });

  it("should apply attrs as default props", () => {
    const hoc = createAttrsHOC({
      attrs: [(_props: any) => ({ label: "default" })],
      priorityAttrs: [],
    });
    const Enhanced = hoc(Receiver);

    const result = Enhanced({}) as any;
    expect(result.children).toBe("default");
  });

  it("should let explicit props override attrs", () => {
    const hoc = createAttrsHOC({
      attrs: [() => ({ label: "from-attrs" })],
      priorityAttrs: [],
    });
    const Enhanced = hoc(Receiver);

    const result = Enhanced({ label: "explicit" }) as any;
    expect(result.children).toBe("explicit");
  });

  it("should apply priorityAttrs with lowest precedence", () => {
    const hoc = createAttrsHOC({
      attrs: [(_props: any) => ({ label: "from-attrs" })],
      priorityAttrs: [(_props: any) => ({ label: "from-priority" })],
    });
    const Enhanced = hoc(Receiver);

    const result = Enhanced({}) as any;
    expect(result.children).toBe("from-attrs");
  });

  it("should merge results from multiple attrs functions", () => {
    const hoc = createAttrsHOC({
      attrs: [() => ({ "data-first": "a" }), () => ({ "data-second": "b" })],
      priorityAttrs: [],
    });
    const Enhanced = hoc(Receiver);

    const result = Enhanced({}) as any;
    expect(result.props["data-first"]).toBe("a");
    expect(result.props["data-second"]).toBe("b");
  });

  it("should remove undefined props so they dont override defaults", () => {
    const hoc = createAttrsHOC({
      attrs: [() => ({ label: "default-label" })],
      priorityAttrs: [],
    });
    const Enhanced = hoc(Receiver);

    const result = Enhanced({ label: undefined }) as any;
    expect(result.children).toBe("default-label");
  });

  it("should allow null to override defaults", () => {
    const hoc = createAttrsHOC({
      attrs: [() => ({ label: "default-label" })],
      priorityAttrs: [],
    });
    const Enhanced = hoc(Receiver);

    const result = Enhanced({ label: null }) as any;
    expect(result.children).toBe("");
  });
});

// --------------------------------------------------------
// attrsHoc - attrs callback receives props
// --------------------------------------------------------
describe("attrsHoc - attrs callback receives props", () => {
  it("should pass filtered props to attrs callback", () => {
    const attrsFn = vi.fn(() => ({}));
    const hoc = createAttrsHOC({
      attrs: [attrsFn],
      priorityAttrs: [],
    });
    const Enhanced = hoc(Receiver);

    Enhanced({ variant: "primary", size: "lg" });
    expect(attrsFn).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "primary", size: "lg" }),
    );
  });

  it("should pass priority attrs merged with props to attrs callback", () => {
    const attrsFn = vi.fn(() => ({}));
    const hoc = createAttrsHOC({
      attrs: [attrsFn],
      priorityAttrs: [() => ({ fromPriority: true })],
    });
    const Enhanced = hoc(Receiver);

    Enhanced({ variant: "primary" });
    expect(attrsFn).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "primary", fromPriority: true }),
    );
  });
});

// --------------------------------------------------------
// attrsHoc - ref passthrough
// --------------------------------------------------------
describe("attrsHoc - ref passthrough", () => {
  it("should pass ref as a normal prop to wrapped component", () => {
    const hoc = createAttrsHOC({ attrs: [], priorityAttrs: [] });
    const Enhanced = hoc(Receiver);

    const refObj = { current: null };
    const result = Enhanced({ ref: refObj }) as any;
    expect(result.props.ref).toBe(refObj);
  });
});

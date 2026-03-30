import {
  detectReactPatterns,
  diagnoseError,
  hasReactPatterns,
  migrateReactCode,
} from "../react-intercept";

// ─── hasReactPatterns ────────────────────────────────────────────────────────

describe("hasReactPatterns", () => {
  test("returns true for React import", () => {
    expect(hasReactPatterns(`import { useState } from "react"`)).toBe(true);
  });

  test("returns true for react-dom import", () => {
    expect(hasReactPatterns(`import { createRoot } from "react-dom/client"`)).toBe(true);
  });

  test("returns true for react-router import", () => {
    expect(hasReactPatterns(`import { Link } from "react-router-dom"`)).toBe(true);
  });

  test("returns true for useState call", () => {
    expect(hasReactPatterns("const [a, b] = useState(0)")).toBe(true);
  });

  test("returns true for useState with type parameter", () => {
    expect(hasReactPatterns("const [a, b] = useState<number>(0)")).toBe(true);
  });

  test("returns true for useEffect call", () => {
    expect(hasReactPatterns("useEffect(() => {}, [])")).toBe(true);
  });

  test("returns true for useMemo call", () => {
    expect(hasReactPatterns("useMemo(() => x * 2, [x])")).toBe(true);
  });

  test("returns true for useCallback call", () => {
    expect(hasReactPatterns("useCallback(() => doThing(), [])")).toBe(true);
  });

  test("returns true for useRef call", () => {
    expect(hasReactPatterns("useRef(null)")).toBe(true);
  });

  test("returns true for useRef with type parameter", () => {
    expect(hasReactPatterns("useRef<HTMLDivElement>(null)")).toBe(true);
  });

  test("returns true for useReducer call", () => {
    expect(hasReactPatterns("useReducer(reducer, init)")).toBe(true);
  });

  test("returns true for useReducer with type parameter", () => {
    expect(hasReactPatterns("useReducer<State>(reducer, init)")).toBe(true);
  });

  test("returns true for React.memo", () => {
    expect(hasReactPatterns("React.memo(MyComponent)")).toBe(true);
  });

  test("returns true for forwardRef call", () => {
    expect(hasReactPatterns("forwardRef((props, ref) => {})")).toBe(true);
  });

  test("returns true for forwardRef with type parameter", () => {
    expect(hasReactPatterns("forwardRef<HTMLInputElement>((props, ref) => {})")).toBe(true);
  });

  test("returns true for className attribute", () => {
    expect(hasReactPatterns('className="foo"')).toBe(true);
  });

  test("returns true for className with space", () => {
    expect(hasReactPatterns("className ")).toBe(true);
  });

  test("returns true for htmlFor attribute", () => {
    expect(hasReactPatterns('htmlFor="name"')).toBe(true);
  });

  test("returns true for .value assignment", () => {
    expect(hasReactPatterns("count.value = 5")).toBe(true);
  });

  test("returns false for pure Pyreon code", () => {
    expect(
      hasReactPatterns(`
      import { signal, effect, computed } from "@pyreon/reactivity"
      const count = signal(0)
      effect(() => console.log(count()))
    `),
    ).toBe(false);
  });

  test("returns false for empty code", () => {
    expect(hasReactPatterns("")).toBe(false);
  });

  test("returns false for plain JavaScript", () => {
    expect(hasReactPatterns("const x = 42\nfunction foo() { return x }")).toBe(false);
  });
});

// ─── detectReactPatterns ─────────────────────────────────────────────────────

describe("detectReactPatterns", () => {
  test("detects React import", () => {
    const diags = detectReactPatterns(`import { useState } from "react"`);
    const importDiag = diags.find((d) => d.code === "react-import");
    expect(importDiag).toBeDefined();
    expect(importDiag!.suggested).toContain("@pyreon/core");
    expect(importDiag!.fixable).toBe(true);
  });

  test("detects react-dom import", () => {
    const diags = detectReactPatterns(`import { createRoot } from "react-dom/client"`);
    const importDiag = diags.find((d) => d.code === "react-dom-import");
    expect(importDiag).toBeDefined();
    expect(importDiag!.suggested).toContain("@pyreon/runtime-dom");
    expect(importDiag!.fixable).toBe(true);
  });

  test("detects react-router import", () => {
    const diags = detectReactPatterns(`import { Link } from "react-router-dom"`);
    const importDiag = diags.find((d) => d.code === "react-router-import");
    expect(importDiag).toBeDefined();
    expect(importDiag!.suggested).toContain("@pyreon/router");
  });

  test("detects useState with destructuring", () => {
    const diags = detectReactPatterns("const [count, setCount] = useState(0)");
    const d = diags.find((d) => d.code === "use-state");
    expect(d).toBeDefined();
    expect(d!.message).toContain("signal");
    expect(d!.suggested).toContain("count = signal(0)");
    expect(d!.fixable).toBe(true);
  });

  test("detects useState without array destructuring", () => {
    const diags = detectReactPatterns("const state = useState(0)");
    const d = diags.find((d) => d.code === "use-state");
    expect(d).toBeDefined();
    expect(d!.suggested).toContain("signal");
  });

  test("detects useEffect with empty deps (mount pattern)", () => {
    const code = `useEffect(() => { console.log("mounted") }, [])`;
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "use-effect-mount");
    expect(d).toBeDefined();
    expect(d!.message).toContain("onMount");
    expect(d!.suggested).toContain("onMount");
    expect(d!.fixable).toBe(true);
  });

  test("detects useEffect with empty deps and cleanup", () => {
    const code = `useEffect(() => { const id = setInterval(tick, 1000); return () => clearInterval(id) }, [])`;
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "use-effect-mount");
    expect(d).toBeDefined();
    expect(d!.suggested).toContain("cleanup");
  });

  test("detects useEffect with dependency array", () => {
    const code = "useEffect(() => { document.title = count }, [count])";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "use-effect-deps");
    expect(d).toBeDefined();
    expect(d!.message).toContain("auto-tracks");
    expect(d!.fixable).toBe(true);
  });

  test("detects useEffect with no dependency array", () => {
    const code = "useEffect(() => { console.log('render') })";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "use-effect-no-deps");
    expect(d).toBeDefined();
    expect(d!.message).toContain("auto-tracks");
    expect(d!.fixable).toBe(true);
  });

  test("detects useLayoutEffect", () => {
    const code = "useLayoutEffect(() => { measure() }, [])";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "use-effect-mount");
    expect(d).toBeDefined();
    expect(d!.message).toContain("useLayoutEffect");
  });

  test("detects useMemo", () => {
    const code = "const doubled = useMemo(() => count * 2, [count])";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "use-memo");
    expect(d).toBeDefined();
    expect(d!.message).toContain("computed");
    expect(d!.suggested).toContain("computed");
    expect(d!.fixable).toBe(true);
  });

  test("detects useCallback", () => {
    const code = "const handleClick = useCallback(() => doThing(), [doThing])";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "use-callback");
    expect(d).toBeDefined();
    expect(d!.message).toContain("not needed");
    expect(d!.suggested).toContain("() => doThing()");
    expect(d!.fixable).toBe(true);
  });

  test("detects useRef with null (DOM ref)", () => {
    const code = "const inputRef = useRef(null)";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "use-ref-dom");
    expect(d).toBeDefined();
    expect(d!.message).toContain("createRef");
    expect(d!.suggested).toContain("createRef()");
    expect(d!.fixable).toBe(true);
  });

  test("detects useRef with value (mutable box)", () => {
    const code = "const prevCount = useRef(0)";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "use-ref-box");
    expect(d).toBeDefined();
    expect(d!.message).toContain("signal");
    expect(d!.suggested).toContain("signal(0)");
    expect(d!.fixable).toBe(true);
  });

  test("detects useReducer", () => {
    const code = "const [state, dispatch] = useReducer(reducer, initialState)";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "use-reducer");
    expect(d).toBeDefined();
    expect(d!.message).toContain("signal");
    expect(d!.fixable).toBe(false);
  });

  test("detects memo() wrapper", () => {
    const code = "const MyComp = memo(function MyComp() { return <div /> })";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "memo-wrapper");
    expect(d).toBeDefined();
    expect(d!.message).toContain("not needed");
    expect(d!.fixable).toBe(true);
  });

  test("detects React.memo() wrapper", () => {
    const code = "const MyComp = React.memo(function MyComp() { return <div /> })";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "memo-wrapper");
    expect(d).toBeDefined();
  });

  test("detects forwardRef()", () => {
    const code = "const Input = forwardRef((props, ref) => <input ref={ref} />)";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "forward-ref");
    expect(d).toBeDefined();
    expect(d!.message).toContain("not needed");
    expect(d!.fixable).toBe(true);
  });

  test("detects React.forwardRef()", () => {
    const code = "const Input = React.forwardRef((props, ref) => <input ref={ref} />)";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "forward-ref");
    expect(d).toBeDefined();
  });

  test("detects className attribute", () => {
    const code = 'const el = <div className="container">Hello</div>';
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "class-name-prop");
    expect(d).toBeDefined();
    expect(d!.message).toContain("class");
    expect(d!.suggested).toContain("class");
    expect(d!.fixable).toBe(true);
  });

  test("detects htmlFor attribute", () => {
    const code = 'const el = <label htmlFor="name">Name</label>';
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "html-for-prop");
    expect(d).toBeDefined();
    expect(d!.message).toContain("for");
    expect(d!.suggested).toContain("for");
    expect(d!.fixable).toBe(true);
  });

  test("detects onChange on input", () => {
    const code = "const el = <input onChange={handleChange} />";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "on-change-input");
    expect(d).toBeDefined();
    expect(d!.message).toContain("onInput");
    expect(d!.suggested).toContain("onInput");
    expect(d!.fixable).toBe(true);
  });

  test("detects onChange on textarea", () => {
    const code = "const el = <textarea onChange={handleChange} />";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "on-change-input");
    expect(d).toBeDefined();
    expect(d!.message).toContain("textarea");
  });

  test("detects onChange on select", () => {
    const code = "const el = <select onChange={handleChange} />";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "on-change-input");
    expect(d).toBeDefined();
    expect(d!.message).toContain("select");
  });

  test("does NOT detect onChange on non-input element", () => {
    const code = "const el = <div onChange={handleChange} />";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "on-change-input");
    expect(d).toBeUndefined();
  });

  test("detects dangerouslySetInnerHTML", () => {
    const code = 'const el = <div dangerouslySetInnerHTML={{ __html: "<b>hi</b>" }} />';
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "dangerously-set-inner-html");
    expect(d).toBeDefined();
    expect(d!.message).toContain("innerHTML");
    expect(d!.suggested).toContain("innerHTML");
    expect(d!.fixable).toBe(true);
  });

  test("detects .value assignment on signal-like variable", () => {
    const code = "count.value = 5";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "dot-value-signal");
    expect(d).toBeDefined();
    expect(d!.message).toContain("Vue ref");
    expect(d!.suggested).toContain("count.set(5)");
    expect(d!.fixable).toBe(false);
  });

  test("detects .map() in JSX expression", () => {
    const code = "const el = <ul>{items.map(item => <li>{item}</li>)}</ul>";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "array-map-jsx");
    expect(d).toBeDefined();
    expect(d!.message).toContain("<For>");
    expect(d!.fixable).toBe(false);
  });

  test("returns empty array for pure Pyreon code", () => {
    const code = `
import { signal, effect } from "@pyreon/reactivity"
const count = signal(0)
effect(() => console.log(count()))
const el = <div class="foo">{count()}</div>
`;
    const diags = detectReactPatterns(code);
    expect(diags).toEqual([]);
  });

  test("includes correct line and column information", () => {
    const code = "const [count, setCount] = useState(0)";
    const diags = detectReactPatterns(code);
    const d = diags.find((d) => d.code === "use-state");
    expect(d).toBeDefined();
    expect(d!.line).toBe(1);
    expect(d!.column).toBeGreaterThanOrEqual(0);
  });

  test("detects multiple patterns in one file", () => {
    const code = `
import { useState, useEffect, useMemo } from "react"
const [count, setCount] = useState(0)
useEffect(() => {}, [])
const doubled = useMemo(() => count * 2, [count])
`;
    const diags = detectReactPatterns(code);
    expect(diags.find((d) => d.code === "react-import")).toBeDefined();
    expect(diags.find((d) => d.code === "use-state")).toBeDefined();
    expect(diags.find((d) => d.code === "use-effect-mount")).toBeDefined();
    expect(diags.find((d) => d.code === "use-memo")).toBeDefined();
    expect(diags.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── migrateReactCode ────────────────────────────────────────────────────────

describe("migrateReactCode", () => {
  test("rewrites useState to signal", () => {
    const code = `const [count, setCount] = useState(0)`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("count = signal(0)");
    expect(result.code).not.toContain("useState");
    expect(result.changes.length).toBeGreaterThan(0);
  });

  test("rewrites useEffect with deps to effect", () => {
    const code = `useEffect(() => { console.log(count) }, [count])`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("effect(");
    expect(result.code).not.toContain("useEffect");
  });

  test("rewrites useEffect with empty deps to onMount", () => {
    const code = `useEffect(() => { setup() }, [])`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("onMount(");
    expect(result.code).not.toContain("useEffect");
  });

  test("rewrites useEffect with no deps to effect", () => {
    const code = `useEffect(() => { console.log("render") })`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("effect(");
    expect(result.code).not.toContain("useEffect");
  });

  test("rewrites useMemo to computed", () => {
    const code = `const doubled = useMemo(() => count * 2, [count])`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("computed(");
    expect(result.code).not.toContain("useMemo");
  });

  test("removes useCallback wrapper", () => {
    const code = `const handleClick = useCallback(() => doThing(), [doThing])`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("() => doThing()");
    expect(result.code).not.toContain("useCallback");
  });

  test("rewrites useRef(null) to createRef()", () => {
    const code = `const inputRef = useRef(null)`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("createRef()");
    expect(result.code).not.toContain("useRef");
  });

  test("rewrites useRef(value) to signal(value)", () => {
    const code = `const prevCount = useRef(0)`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("signal(0)");
    expect(result.code).not.toContain("useRef");
  });

  test("rewrites useRef(undefined) to createRef()", () => {
    const code = `const ref = useRef(undefined)`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("createRef()");
  });

  test("removes memo() wrapper", () => {
    const code = `const MyComp = memo(function MyComp() { return <div /> })`;
    const result = migrateReactCode(code);
    expect(result.code).not.toContain("memo(");
    expect(result.code).toContain("function MyComp()");
  });

  test("removes React.memo() wrapper", () => {
    const code = `const MyComp = React.memo(function MyComp() { return <div /> })`;
    const result = migrateReactCode(code);
    expect(result.code).not.toContain("React.memo");
    expect(result.code).toContain("function MyComp()");
  });

  test("removes forwardRef() wrapper", () => {
    const code = `const Input = forwardRef((props, ref) => <input ref={ref} />)`;
    const result = migrateReactCode(code);
    expect(result.code).not.toContain("forwardRef");
    expect(result.code).toContain("(props, ref) =>");
  });

  test("removes React.forwardRef() wrapper", () => {
    const code = `const Input = React.forwardRef((props, ref) => <input ref={ref} />)`;
    const result = migrateReactCode(code);
    expect(result.code).not.toContain("forwardRef");
    expect(result.code).toContain("(props, ref) =>");
  });

  test("rewrites className to class", () => {
    const code = `const el = <div className="container">Hello</div>`;
    const result = migrateReactCode(code);
    expect(result.code).toContain('class="container"');
    expect(result.code).not.toContain("className");
  });

  test("rewrites onChange to onInput on input", () => {
    const code = `const el = <input onChange={handleChange} />`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("onInput");
    expect(result.code).not.toContain("onChange");
  });

  test("rewrites onChange to onInput on textarea", () => {
    const code = `const el = <textarea onChange={handleChange} />`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("onInput");
  });

  test("rewrites onChange to onInput on select", () => {
    const code = `const el = <select onChange={handleChange} />`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("onInput");
  });

  test("rewrites React imports to Pyreon imports", () => {
    const code = `import { useState, useEffect, useMemo } from "react"
const [count, setCount] = useState(0)
useEffect(() => { console.log(count) }, [count])
const doubled = useMemo(() => count * 2, [count])`;
    const result = migrateReactCode(code);
    expect(result.code).not.toContain(`from "react"`);
    expect(result.code).toContain("@pyreon/reactivity");
  });

  test("rewrites dangerouslySetInnerHTML to innerHTML", () => {
    const code = `const el = <div dangerouslySetInnerHTML={{ __html: htmlString }} />`;
    const result = migrateReactCode(code);
    expect(result.code).toContain("innerHTML={htmlString}");
    expect(result.code).not.toContain("dangerouslySetInnerHTML");
  });

  test("returns change descriptions", () => {
    const code = `const [count, setCount] = useState(0)`;
    const result = migrateReactCode(code);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes[0]!.description).toContain("useState");
  });

  test("handles code with no React patterns (no changes)", () => {
    const code = `const count = signal(0)\neffect(() => console.log(count()))`;
    const result = migrateReactCode(code);
    expect(result.code).toBe(code);
    expect(result.changes).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  test("includes diagnostics in migration result", () => {
    const code = `import { useState } from "react"\nconst [count, setCount] = useState(0)`;
    const result = migrateReactCode(code);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.find((d) => d.code === "use-state")).toBeDefined();
  });

  test("adds correct Pyreon imports", () => {
    const code = `import { useState, useMemo } from "react"
const [count, setCount] = useState(0)
const doubled = useMemo(() => count * 2, [count])`;
    const result = migrateReactCode(code);
    expect(result.code).toContain(`import { computed, signal } from "@pyreon/reactivity"`);
  });

  test("rewrites react-dom/client import specifiers", () => {
    const code = `import { createRoot } from "react-dom/client"
createRoot(document.getElementById("root"))`;
    const result = migrateReactCode(code);
    expect(result.code).not.toContain("react-dom");
    expect(result.code).toContain("@pyreon/runtime-dom");
    expect(result.code).toContain("mount");
  });

  test("migrates full React component", () => {
    const code = `import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react"

const Counter = memo(function Counter() {
  const [count, setCount] = useState(0)
  const inputRef = useRef(null)
  const doubled = useMemo(() => count * 2, [count])
  const handleClick = useCallback(() => setCount(c => c + 1), [])

  useEffect(() => {
    document.title = \`Count: \${count}\`
  }, [count])

  return <div className="counter">{count}</div>
})`;
    const result = migrateReactCode(code);
    expect(result.code).not.toContain("useState");
    expect(result.code).not.toContain("useMemo");
    expect(result.code).not.toContain("useCallback");
    expect(result.code).not.toContain("useRef");
    expect(result.code).not.toContain("className");
    expect(result.code).toContain("signal");
    expect(result.code).toContain("computed");
    expect(result.code).toContain("effect");
    expect(result.code).toContain("createRef");
    expect(result.code).toContain("class=");
    expect(result.changes.length).toBeGreaterThan(0);
  });
});

// ─── diagnoseError ───────────────────────────────────────────────────────────

describe("diagnoseError", () => {
  test("diagnoses 'X is not a function' as signal access issue", () => {
    const result = diagnoseError("count is not a function");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain("count");
    expect(result!.fix).toContain("signal");
    expect(result!.fixCode).toContain("count()");
  });

  test("diagnoses Cannot read properties of undefined (reading 'set')", () => {
    const result = diagnoseError("Cannot read properties of undefined (reading 'set')");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain(".set()");
    expect(result!.fix).toContain("signal");
  });

  test("diagnoses Cannot read properties of undefined (reading 'update')", () => {
    const result = diagnoseError("Cannot read properties of undefined (reading 'update')");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain(".update()");
  });

  test("diagnoses Cannot read properties of undefined (reading 'peek')", () => {
    const result = diagnoseError("Cannot read properties of undefined (reading 'peek')");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain(".peek()");
  });

  test("diagnoses Cannot read properties of undefined (reading 'subscribe')", () => {
    const result = diagnoseError("Cannot read properties of undefined (reading 'subscribe')");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain(".subscribe()");
  });

  test("diagnoses missing @pyreon package", () => {
    const result = diagnoseError("Cannot find module '@pyreon/reactivity'");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain("@pyreon/reactivity");
    expect(result!.fix).toContain("bun add");
  });

  test("diagnoses missing react module in Pyreon project", () => {
    const result = diagnoseError("Cannot find module 'react'");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain("react");
    expect(result!.fix).toContain("Pyreon");
  });

  test("diagnoses .value property on Signal type", () => {
    const result = diagnoseError("Property 'value' does not exist on type 'Signal<number>'");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain(".value");
    expect(result!.fix).toContain("callable");
    expect(result!.fixCode).toContain("mySignal()");
  });

  test("diagnoses non-value property on Signal type", () => {
    const result = diagnoseError("Property 'current' does not exist on type 'Signal<number>'");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain(".current");
    expect(result!.fix).toContain(".set()");
  });

  test("diagnoses type not assignable to VNode", () => {
    const result = diagnoseError("Type 'number' is not assignable to type 'VNode'");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain("number");
    expect(result!.fix).toContain("JSX");
  });

  test("diagnoses onMount callback return type error", () => {
    const result = diagnoseError("onMount callback must return");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain("CleanupFn");
    expect(result!.fixCode).toContain("onMount");
  });

  test("diagnoses missing by prop on For", () => {
    const result = diagnoseError("Expected 'by' prop on <For>");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain("by");
    expect(result!.fixCode).toContain("by=");
  });

  test("diagnoses hook called outside component", () => {
    const result = diagnoseError("useHook called outside component boundary");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain("outside");
    expect(result!.fix).toContain("component");
  });

  test("diagnoses hydration mismatch", () => {
    const result = diagnoseError("Hydration mismatch");
    expect(result).not.toBeNull();
    expect(result!.cause).toContain("Server-rendered");
    expect(result!.related).toContain("window");
  });

  test("returns null for unknown errors", () => {
    expect(diagnoseError("Something completely unrelated happened")).toBeNull();
    expect(diagnoseError("")).toBeNull();
    expect(diagnoseError("TypeError: Cannot freeze")).toBeNull();
  });
});

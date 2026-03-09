import { describe, expect, test } from "bun:test"
import { transformJSX } from "../jsx"

// Helper: transform and return the code string
const t = (code: string) => transformJSX(code, "input.tsx").code

// ─── Children ────────────────────────────────────────────────────────────────

describe("JSX transform — children", () => {
  test("wraps dynamic child expression", () => {
    expect(t("<div>{count()}</div>")).toContain("() => count()")
  })

  test("does NOT wrap string literal child", () => {
    expect(t(`<div>{"static"}</div>`)).not.toContain("() =>")
  })

  test("does NOT wrap numeric literal child", () => {
    expect(t("<div>{42}</div>")).not.toContain("() =>")
  })

  test("does NOT wrap null child", () => {
    expect(t("<div>{null}</div>")).not.toContain("() =>")
  })

  test("does NOT double-wrap existing arrow function", () => {
    const result = t("<div>{() => count()}</div>")
    // There should be exactly ONE () => (the original one, not a second wrapper)
    expect(result.match(/\(\) =>/g)?.length).toBe(1)
  })

  test("does NOT wrap a function expression child", () => {
    const result = t("<div>{function() { return x }}</div>")
    // No extra () => wrapping added
    const arrowCount = (result.match(/\(\) =>/g) ?? []).length
    expect(arrowCount).toBe(0)
  })

  test("does NOT wrap plain identifier (no call = not reactive)", () => {
    expect(t("<div>{title}</div>")).not.toContain("() =>")
  })

  test("does NOT wrap ternary without calls", () => {
    expect(t("<div>{a ? b : c}</div>")).not.toContain("() =>")
  })

  test("wraps ternary that contains a call", () => {
    expect(t("<div>{a() ? b : c}</div>")).toContain("() => a() ? b : c")
  })

  test("does NOT wrap logical expression without calls", () => {
    expect(t("<div>{show && <span />}</div>")).not.toContain("() =>")
  })

  test("wraps logical expression containing a call", () => {
    expect(t("<div>{show() && <span />}</div>")).toContain("() => show() && <span />")
  })

  test("does NOT wrap object literal child", () => {
    expect(t("<div>{{ color: 'red' }}</div>")).not.toContain("() =>")
  })

  test("does NOT wrap array literal child", () => {
    expect(t("<div>{[1, 2, 3]}</div>")).not.toContain("() =>")
  })

  test("does NOT wrap boolean true literal", () => {
    expect(t("<div>{true}</div>")).not.toContain("() =>")
  })

  test("does NOT wrap boolean false literal", () => {
    expect(t("<div>{false}</div>")).not.toContain("() =>")
  })

  test("does NOT wrap undefined literal", () => {
    expect(t("<div>{undefined}</div>")).not.toContain("() =>")
  })

  test("does NOT wrap template literal without calls (no substitution)", () => {
    expect(t("<div>{`hello`}</div>")).not.toContain("() =>")
  })

  test("wraps template literal containing a call", () => {
    expect(t("<div>{`hello ${name()}`}</div>")).toContain("() =>")
  })

  test("wraps member access with call", () => {
    expect(t("<div>{obj.getValue()}</div>")).toContain("() => obj.getValue()")
  })

  test("does NOT wrap member access without call", () => {
    expect(t("<div>{obj.value}</div>")).not.toContain("() =>")
  })

  test("wraps binary expression containing a call", () => {
    expect(t("<div>{count() + 1}</div>")).toContain("() => count() + 1")
  })

  test("does NOT wrap binary expression without calls", () => {
    expect(t("<div>{a + b}</div>")).not.toContain("() =>")
  })

  test("wraps tagged template expression", () => {
    expect(t("<div>{css`color: red`}</div>")).toContain("() =>")
  })

  test("does NOT wrap empty JSX expression {}", () => {
    const result = t("<div>{/* comment */}</div>")
    expect(result).not.toContain("() =>")
  })
})

// ─── Props ────────────────────────────────────────────────────────────────────

describe("JSX transform — props", () => {
  test("wraps dynamic class prop", () => {
    expect(t("<div class={activeClass()} />")).toContain("() => activeClass()")
  })

  test("wraps dynamic style prop", () => {
    expect(t("<div style={styles()} />")).toContain("() => styles()")
  })

  test("does NOT wrap string literal prop", () => {
    expect(t(`<div class="foo" />`)).not.toContain("() =>")
  })

  test("does NOT wrap JSX string attribute", () => {
    expect(t(`<div class={"foo"} />`)).not.toContain("() =>")
  })

  test("does NOT wrap onClick (event handler)", () => {
    const result = t("<button onClick={handleClick} />")
    expect(result).not.toContain("() => handleClick")
    expect(result).toContain("handleClick") // still present
  })

  test("does NOT wrap onInput (event handler)", () => {
    expect(t("<input onInput={handler} />")).not.toContain("() => handler")
  })

  test("does NOT wrap onMouseEnter (event handler)", () => {
    expect(t("<div onMouseEnter={fn} />")).not.toContain("() => fn")
  })

  test("does NOT wrap key prop", () => {
    expect(t("<div key={id} />")).not.toContain("() => id")
  })

  test("does NOT wrap ref prop", () => {
    expect(t("<div ref={myRef} />")).not.toContain("() => myRef")
  })

  test("does NOT wrap already-wrapped prop", () => {
    const result = t("<div class={() => cls()} />")
    expect(result.match(/\(\) =>/g)?.length).toBe(1)
  })

  test("does NOT wrap object literal prop (style)", () => {
    expect(t('<div style={{ color: "red" }} />')).not.toContain("() =>")
  })

  test("wraps object literal prop when it contains a call", () => {
    expect(t("<div style={{ color: theme() }} />")).toContain("() =>")
  })

  test("does NOT wrap boolean shorthand attribute", () => {
    // <input disabled /> — no initializer at all
    expect(t("<input disabled />")).not.toContain("() =>")
  })

  test("wraps dynamic data-* attribute", () => {
    expect(t("<div data-id={getId()} />")).toContain("() => getId()")
  })

  test("wraps dynamic aria-* attribute", () => {
    expect(t("<div aria-label={getLabel()} />")).toContain("() => getLabel()")
  })

  test("does NOT wrap onFocus (event handler)", () => {
    expect(t("<input onFocus={handler} />")).not.toContain("() => handler")
  })

  test("does NOT wrap onChange (event handler)", () => {
    expect(t("<input onChange={handler} />")).not.toContain("() => handler")
  })

  test("wraps conditional prop expression with call", () => {
    expect(t("<div title={isActive() ? 'yes' : 'no'} />")).toContain("() =>")
  })
})

// ─── Component elements ──────────────────────────────────────────────────────

describe("JSX transform — component elements", () => {
  test("does NOT wrap props on component elements (uppercase tag)", () => {
    const result = t("<MyComponent value={count()} />")
    expect(result).not.toContain("() => count()")
    expect(result).toContain("count()")
  })

  test("does NOT wrap any prop on uppercase component", () => {
    const result = t("<Button label={getText()} />")
    expect(result).not.toContain("() => getText()")
  })

  test("wraps children of component elements (via JSX expression)", () => {
    // Children in expression containers are still wrapped
    const result = t("<MyComponent>{count()}</MyComponent>")
    expect(result).toContain("() => count()")
  })

  test("wraps props on lowercase DOM elements", () => {
    expect(t("<div title={getTitle()} />")).toContain("() => getTitle()")
  })
})

// ─── Spread attributes ──────────────────────────────────────────────────────

describe("JSX transform — spread attributes", () => {
  test("spread props are left unchanged (not wrapped)", () => {
    const result = t("<div {...props} />")
    // Spread should remain as-is, no reactive wrapping
    expect(result).toContain("{...props}")
    expect(result).not.toContain("() => ...props")
  })

  test("spread with other props — only non-spread dynamic props get wrapped", () => {
    const result = t("<div {...props} class={cls()} />")
    expect(result).toContain("{...props}")
    expect(result).toContain("() => cls()")
  })
})

// ─── Static hoisting ─────────────────────────────────────────────────────────

describe("JSX transform — static hoisting", () => {
  test("hoists static JSX child to module scope", () => {
    const result = t("<div>{<span>Hello</span>}</div>")
    expect(result).toContain("const _$h0")
    expect(result).toContain("<span>Hello</span>")
    expect(result).toContain("{_$h0}")
  })

  test("hoists static self-closing JSX", () => {
    const result = t("<div>{<br />}</div>")
    expect(result).toContain("const _$h0")
    expect(result).toContain("{_$h0}")
  })

  test("does NOT hoist JSX with dynamic props", () => {
    const result = t("<div>{<span class={cls()}>text</span>}</div>")
    expect(result).not.toContain("const _$h0")
  })

  test("hoists JSX with static string prop", () => {
    const result = t(`<div>{<span class="foo">text</span>}</div>`)
    expect(result).toContain("const _$h0")
  })

  test("hoists multiple static JSX children independently", () => {
    const result = t("<div>{<span>A</span>}{<span>B</span>}</div>")
    expect(result).toContain("const _$h0")
    expect(result).toContain("const _$h1")
  })

  test("hoists static fragment", () => {
    const result = t("<div>{<>text</>}</div>")
    expect(result).toContain("const _$h0")
  })

  test("does NOT hoist fragment with dynamic child", () => {
    const result = t("<div>{<>{count()}</>}</div>")
    expect(result).not.toContain("const _$h0")
  })

  test("hoisted declarations include @__PURE__ annotation", () => {
    const result = t("<div>{<span>Hello</span>}</div>")
    expect(result).toContain("/*@__PURE__*/")
  })

  test("does NOT hoist JSX with spread attributes (always dynamic)", () => {
    const result = t("<div>{<span {...props}>text</span>}</div>")
    expect(result).not.toContain("const _$h0")
  })
})

// ─── Mixed ────────────────────────────────────────────────────────────────────

describe("JSX transform — mixed", () => {
  test("wraps props and children independently", () => {
    const result = t("<div class={cls()}>{text()}</div>")
    expect(result).toContain("() => cls()")
    expect(result).toContain("() => text()")
  })

  test("preserves static siblings of dynamic children", () => {
    const result = t("<div>static{count()}</div>")
    expect(result).toContain("static")
    expect(result).toContain("() => count()")
  })

  test("leaves code outside JSX completely unchanged", () => {
    const input = "const x = count() + 1"
    expect(t(input)).toBe(input)
  })

  test("handles multiple JSX elements in one file", () => {
    const input = `
const A = <div>{a()}</div>
const B = <span>{b()}</span>
`
    const result = t(input)
    expect(result).toContain("() => a()")
    expect(result).toContain("() => b()")
  })

  test("handles deeply nested JSX", () => {
    const result = t("<div><span><em>{count()}</em></span></div>")
    expect(result).toContain("() => count()")
  })

  test("returns unchanged code when no JSX present", () => {
    const input = "const x = 1 + 2"
    expect(t(input)).toBe(input)
  })

  test("handles empty JSX element", () => {
    const result = t("<div></div>")
    expect(result).toBe("<div></div>")
  })

  test("handles self-closing element with no props", () => {
    const result = t("<br />")
    expect(result).toBe("<br />")
  })
})

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe("JSX transform — edge cases", () => {
  test("wraps chained method call", () => {
    expect(t("<div>{items().map(x => x)}</div>")).toContain("() =>")
  })

  test("wraps nested call in array expression", () => {
    expect(t("<div>{[getItem()]}</div>")).toContain("() =>")
  })

  test("handles JSX with only text children (no expression)", () => {
    const result = t("<div>hello world</div>")
    expect(result).toBe("<div>hello world</div>")
  })

  test("does NOT wrap arrow function with params", () => {
    const result = t("<div>{(x: number) => x + 1}</div>")
    expect(result).not.toContain("() => (x")
  })

  test("handles .jsx file extension", () => {
    const result = transformJSX("<div>{count()}</div>", "file.jsx").code
    expect(result).toContain("() => count()")
  })

  test("handles .ts file extension (treated as TSX)", () => {
    const result = transformJSX("<div>{count()}</div>", "file.ts").code
    expect(result).toContain("() => count()")
  })

  test("wraps call inside array map", () => {
    expect(t("<ul>{items().map(i => <li>{i}</li>)}</ul>")).toContain("() =>")
  })

  test("does NOT wrap callback function expression inside event prop", () => {
    const result = t("<button onClick={() => doSomething()} />")
    // onClick is an event handler, should not be wrapped at all
    expect(result).not.toContain("() => () =>")
  })

  test("wraps call deep in property access chain", () => {
    expect(t("<div>{store.getState().count}</div>")).toContain("() =>")
  })

  test("does NOT wrap function expression child (named)", () => {
    const result = t("<div>{function foo() { return 1 }}</div>")
    expect(result).not.toContain("() => function")
  })
})

// ─── TransformResult type ────────────────────────────────────────────────────

describe("transformJSX return value", () => {
  test("returns object with code property", () => {
    const result = transformJSX("<div>{count()}</div>")
    expect(typeof result.code).toBe("string")
  })

  test("default filename is input.tsx", () => {
    // Should not throw with default filename
    const result = transformJSX("<div>{count()}</div>")
    expect(result.code).toContain("() => count()")
  })
})

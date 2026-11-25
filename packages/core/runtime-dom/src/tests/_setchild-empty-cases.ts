/**
 * #4599, recorded for the real-Chromium suite
 * (`setchild-empty-element-adoption.browser.test.tsx`), which can run neither
 * the compiler nor `renderToString`. Each case carries the REAL client emit
 * (`transformJSX`, imports stripped, residual JSX lowered to `h()` by esbuild)
 * and the server HTML of the SSR compile. The happy-dom twin
 * (`setchild-empty-element-adoption.test.tsx`) regenerates both and fails on
 * drift.
 *
 * Scope for every case: `vNode = <b>n</b>`, `vArr = ['t', <b>n</b>]`,
 * `rows = [{ id: 1, cell: <b>one</b> }, { id: 2, cell: ['t', <i>two</i>] }]`,
 * `clear` / `prepend` / `append` refs (the server never runs a ref),
 * `hp = { dangerouslySetInnerHTML: { __html: '<i>h</i>' } }` and
 * `rowsMix = [{ id: 1, cell: 's' }, { id: 2, cell: <b>two</b> }, { id: 3, cell: <b>three</b> }]`.
 */
export interface SetChildEmptyCase {
  name: string
  source: string
  compiled: string
  server: string
}

export const SETCHILD_EMPTY_CASES: SetChildEmptyCase[] = [
  {
    name: "sole VNode under a static parent",
    source: "export const App = () => <div><span>{vNode}</span></div>",
    compiled: "const App = () => _tpl(\"<div><span></span></div>\", (__root) => {\n  const __e0 = __root.firstElementChild;\n  _setChild(__e0, vNode);\n  return null;\n});\n",
    server: "<div><span><b>n</b></span></div>",
  },
  {
    name: "sole array",
    source: "export const App = () => <div><span>{vArr}</span></div>",
    compiled: "const App = () => _tpl(\"<div><span></span></div>\", (__root) => {\n  const __e0 = __root.firstElementChild;\n  _setChild(__e0, vArr);\n  return null;\n});\n",
    server: "<div><span>t<b>n</b></span></div>",
  },
  {
    name: "fused static mix",
    source: "export const App = () => <div><span>a{vNode}b</span></div>",
    compiled: "const App = () => _tpl(\"<div><span></span></div>\", (__root) => {\n  const __e0 = __root.firstElementChild;\n  _setChild(__e0, _fuse(\"a\", vNode, \"b\"));\n  return null;\n});\n",
    server: "<div><span>a<b>n</b>b</span></div>",
  },
  {
    name: "template root is the target",
    source: "export const App = () => <p class=\"x\">{vNode}</p>",
    compiled: "const App = () => _tpl('<p class=\"x\"></p>', (__root) => {\n  _setChild(__root, vNode);\n  return null;\n});\n",
    server: "<p class=\"x\"><b>n</b></p>",
  },
  {
    name: "two targets beside a static sibling",
    source: "export const App = () => <div><span>{vNode}</span><s /><em>{vArr}</em></div>",
    compiled: "const App = () => _tpl(\"<div><span></span><s></s><em></em></div>\", (__root) => {\n  const __e0 = __root.firstElementChild;\n  const __e1 = __e0.nextElementSibling.nextElementSibling;\n  _setChild(__e0, vNode);\n  _setChild(__e1, vArr);\n  return null;\n});\n",
    server: "<div><span><b>n</b></span><s></s><em>t<b>n</b></em></div>",
  },
  {
    name: "<For> row cells holding a VNode and an array",
    source: "export const App = () => <ul><For each={rows} by={(r) => r.id}>{(r) => <li class=\"sc\">{r.cell}</li>}</For></ul>",
    compiled: "const App = () => _tpl(\"<ul data-pyreon-hole></ul>\", (__root) => {\n  const __d0 = _mountChild(/* @__PURE__ */ h(For, { each: rows, by: (r) => r.id }, (r) => _tpl('<li class=\"sc\"></li>', (__root2) => {\n    _setChild(__root2, r.cell);\n    return null;\n  })), __root, null);\n  return __d0;\n});\n",
    server: "<ul><!--pyreon-for--><li class=\"sc\"><b>one</b></li><li class=\"sc\">t<i>two</i></li><!--/pyreon-for:1 2--></ul>",
  },
  {
    name: "a ref that clears, beside a sibling cell",
    source: "export const App = () => <div><span ref={clear}>{vNode}</span><em>{vArr}</em></div>",
    compiled: "const App = () => _tpl(\"<div><span></span><em></em></div>\", (__root) => {\n  const __e0 = __root.firstElementChild;\n  const __e1 = __e0.nextElementSibling;\n  _setChild(__e0, vNode);\n  _setChild(__e1, vArr);\n  const __d0 = _ref(__e0, clear);\n  return __d0;\n});\n",
    server: "<div><span><b>n</b></span><em>t<b>n</b></em></div>",
  },
  {
    name: "a ref that prepends",
    source: "export const App = () => <div><span ref={prepend}>{vArr}</span></div>",
    compiled: "const App = () => _tpl(\"<div><span></span></div>\", (__root) => {\n  const __e0 = __root.firstElementChild;\n  _setChild(__e0, vArr);\n  const __d0 = _ref(__e0, prepend);\n  return __d0;\n});\n",
    server: "<div><span>t<b>n</b></span></div>",
  },
  {
    name: "a root spread with dangerouslySetInnerHTML and a cell",
    source: "export const App = () => <div {...hp}>{vNode}</div>",
    compiled: "const App = () => _tpl(\"<div></div>\", (__root) => {\n  const __d0 = _applyProps(__root, hp, 1);\n  _setChild(__root, vNode);\n  const __d1 = __d0.r();\n  return _dispose2(__d0, __d1);\n});\n",
    server: "<div><i>h</i></div>",
  },
  {
    name: "plan-replayed <For> rows whose cells hold elements, with a ref that appends",
    source: "export const App = () => <ul><For each={rowsMix} by={(r) => r.id}>{(r) => <li ref={append}>{r.cell}</li>}</For></ul>",
    compiled: "const App = () => _tpl(\"<ul data-pyreon-hole></ul>\", (__root) => {\n  const __d0 = _mountChild(/* @__PURE__ */ h(For, { each: rowsMix, by: (r) => r.id }, (r) => _tpl(\"<li></li>\", (__root2) => {\n    _setChild(__root2, r.cell);\n    const __d02 = _ref(__root2, append);\n    return __d02;\n  })), __root, null);\n  return __d0;\n});\n",
    server: "<ul><!--pyreon-for--><li>s</li><li><b>two</b></li><li><b>three</b></li><!--/pyreon-for:1 2 3--></ul>",
  },
]

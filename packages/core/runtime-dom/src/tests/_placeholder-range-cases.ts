/**
 * #4385 case D, recorded for the real-Chromium suite
 * (`ssr-placeholder-markers.browser.test.tsx`), which can run neither the
 * compiler nor `renderToString`. Each case carries the REAL client emit
 * (`transformJSX`, imports stripped, residual JSX lowered to `h()` by esbuild)
 * and the server HTML of the SSR compile. The happy-dom twin
 * (`ssr-placeholder-markers.test.tsx`) regenerates both and fails on drift.
 *
 * Scope for every case: `flag = 'Before'`, `vNode = <b>n</b>`,
 * `rows = [{ id: 1, name: 'one' }, { id: 2, name: 'two' }]`.
 */
export interface PlaceholderRangeCase {
  name: string
  source: string
  compiled: string
  server: string
}

export const PLACEHOLDER_RANGE_CASES: PlaceholderRangeCase[] = [
  {
    name: 'mid static conditional (`_mountSlot`, the issue shape)',
    source: 'export const App = () => <span>{flag ? <b>{flag}</b> : null}<i /></span>',
    compiled: "const App = () => _tpl(\"<span><!><i></i></span>\", (__root) => {\n  const __p0 = __root.firstChild;\n  const __d0 = _mountSlot(flag ? /* @__PURE__ */ h(\"b\", null, flag) : null, __root, __p0);\n  return __d0;\n});\n",
    server: '<span><!--$--><b>Before</b><!--/$--><i></i></span>',
  },
  {
    name: 'mid static VNode value (`_setChildAt`)',
    source: 'export const App = () => <span><s />{vNode}<i /></span>',
    compiled: "const App = () => _tpl(\"<span><s></s><!><i></i></span>\", (__root) => {\n  const __p0 = __root.firstChild.nextSibling;\n  _setChildAt(__root, __p0, vNode);\n  return null;\n});\n",
    server: '<span><s></s><!--$--><b>n</b><!--/$--><i></i></span>',
  },
  {
    name: 'trailing static VNode value (`_setChildAt`, range left in place)',
    source: 'export const App = () => <span><s />{vNode}</span>',
    compiled: "const App = () => _tpl(\"<span><s></s><!></span>\", (__root) => {\n  const __p0 = __root.firstChild.nextSibling;\n  _setChildAt(__root, __p0, vNode);\n  return null;\n});\n",
    server: '<span><s></s><!--$--><b>n</b><!--/$--></span>',
  },
  {
    name: '<For> row with a fixed field between siblings',
    source:
      'export const App = () => <ul><For each={rows} by={(r) => r.id}>{(r) => <li><b />{r.name}<i /></li>}</For></ul>',
    compiled: "const App = () => _tpl(\"<ul data-pyreon-hole></ul>\", (__root) => {\n  const __d0 = _mountChild(/* @__PURE__ */ h(For, { each: rows, by: (r) => r.id }, (r) => _tpl(\"<li><b></b><!><i></i></li>\", (__root2) => {\n    const __p0 = __root2.firstChild.nextSibling;\n    _setChildAt(__root2, __p0, r.name);\n    return null;\n  })), __root, null);\n  return __d0;\n});\n",
    server:
      '<ul><!--pyreon-for--><li><b></b><!--$-->one<!--/$--><i></i></li><li><b></b><!--$-->two<!--/$--><i></i></li><!--/pyreon-for:1 2--></ul>',
  },
]

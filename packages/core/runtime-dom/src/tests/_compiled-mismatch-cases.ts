/**
 * Compiled-template hydration mismatches, one per kind (#4419).
 *
 * Shared by the real-Chromium suite (`hydrate-compiled-mismatch-report.browser.test.tsx`)
 * and its happy-dom twin (`hydrate-compiled-mismatch-report.test.tsx`). The
 * compiler and `renderToString` cannot run in the page, so each case carries
 * the REAL compiler output (`transformJSX`, imports stripped, residual
 * component JSX lowered to `h()` by esbuild) and the server HTML. The twin
 * regenerates both and fails on any drift, so the browser never runs a guess.
 *
 * `match` is what `renderToString` gives for the same source. `server` is that
 * HTML with the client's value changed, i.e. what a divergent server sent.
 */

export interface MismatchReport {
  type: 'tag' | 'text' | 'missing'
  expected: string
  actual: string
  path: string
}

export interface CompiledMismatchCase {
  /** The kind of divergence and the compiled helper that meets it. */
  name: string
  /** The component source the twin compiles. */
  source: string
  /** `transformJSX(source)` with imports stripped and residual JSX lowered. */
  compiled: string
  /** `renderToString` of the same source (server and client agree). */
  match: string
  /** A divergent server's HTML. */
  server: string
  /** What hydrating `compiled` over `server` reports, in order. */
  reports: MismatchReport[]
}

export const COMPILED_MISMATCH_CASES: CompiledMismatchCase[] = [
  {
    name: "static sole child (`_setChild`)",
    source: "export const App = () => <p id=\"w\">{typeof window === 'undefined' ? 'Rendered on the server' : 'Rendered in the browser'}</p>",
    compiled: "const App = () => _tpl('<p id=\"w\"></p>', (__root) => {\n  _setChild(__root, typeof window === \"undefined\" ? \"Rendered on the server\" : \"Rendered in the browser\");\n  return null;\n});\n",
    match: "<p id=\"w\">Rendered in the browser</p>",
    server: "<p id=\"w\">Rendered on the server</p>",
    reports: [{ type: "text", expected: "Rendered in the browser", actual: "Rendered on the server", path: "root > p > text" }],
  },
  {
    name: "bound sole child (`_bindText`)",
    source: "const where = signal('Rendered in the browser')\nexport const App = () => <p id=\"w\">{() => where()}</p>",
    compiled: "const where = signal(\"Rendered in the browser\");\nconst App = () => _tpl('<p id=\"w\"> </p>', (__root) => {\n  const __t0 = __root.firstChild;\n  const __d0 = _bindText(where, __t0);\n  return __d0;\n});\n",
    match: "<p id=\"w\">Rendered in the browser</p>",
    server: "<p id=\"w\">Rendered on the server</p>",
    reports: [{ type: "text", expected: "Rendered in the browser", actual: "Rendered on the server", path: "root > p > reactive" }],
  },
  {
    name: "prop child (`_bindProp`)",
    source: "const Inner = (props) => <p>{props.t}</p>\nexport const App = () => h(Inner, { t: 'browser' })",
    compiled: "const Inner = (props) => _tpl(\"<p> </p>\", (__root) => {\n  const __t0 = __root.firstChild;\n  const __d0 = _bindProp(props, \"t\", __t0, __root);\n  return __d0;\n});\nconst App = () => h(Inner, { t: \"browser\" });\n",
    match: "<p>browser</p>",
    server: "<p>server</p>",
    reports: [{ type: "text", expected: "browser", actual: "server", path: "root > p > reactive" }],
  },
  {
    name: "fused text (`bindPolymorphicText`)",
    source: "const n = signal('browser')\nexport const App = () => <p>Hello {n()}!</p>",
    compiled: "const n = signal(\"browser\");\nconst App = () => _tpl(\"<p> </p>\", (__root) => {\n  const __t0 = __root.firstChild;\n  const __d0 = bindPolymorphicText(() => _fuse(\"Hello \", n(), \"!\"), __t0, __root);\n  return __d0;\n});\n",
    match: "<p>Hello browser!</p>",
    server: "<p>Hello server!</p>",
    reports: [{ type: "text", expected: "Hello browser!", actual: "Hello server!", path: "root > p > reactive" }],
  },
  {
    name: "text slot beside an element (`_textSlot`)",
    source: "const n = signal('browser')\nexport const App = () => <p>{n()}<b>b</b></p>",
    compiled: "const n = signal(\"browser\");\nconst App = () => _tpl(\"<p><!><b>b</b></p>\", (__root) => {\n  const __p0 = __root.firstChild;\n  const __t0 = _textSlot(__root, __p0);\n  const __d0 = _bindText(n, __t0);\n  return __d0;\n});\n",
    match: "<p><!--$-->browser<!--/$--><b>b</b></p>",
    server: "<p><!--$-->server<!--/$--><b>b</b></p>",
    reports: [{ type: "text", expected: "browser", actual: "server", path: "root > p > reactive" }],
  },
  {
    name: "mid static text (`_setChildAt`)",
    source: "export const App = () => <p><b>a</b>{typeof window === 'undefined' ? 'server' : 'browser'}<i>b</i></p>",
    compiled: "const App = () => _tpl(\"<p><b>a</b><!><i>b</i></p>\", (__root) => {\n  const __p0 = __root.firstChild.nextSibling;\n  _setChildAt(__root, __p0, typeof window === \"undefined\" ? \"server\" : \"browser\");\n  return null;\n});\n",
    match: "<p><b>a</b>browser<i>b</i></p>",
    server: "<p><b>a</b>server<i>b</i></p>",
    reports: [{ type: "text", expected: "browser", actual: "server", path: "root > p > text" }],
  },
  {
    name: "server rendered no text, client renders some",
    source: "const n = signal('browser')\nexport const App = () => <p id=\"w\">{n()}</p>",
    compiled: "const n = signal(\"browser\");\nconst App = () => _tpl('<p id=\"w\"> </p>', (__root) => {\n  const __t0 = __root.firstChild;\n  const __d0 = _bindText(n, __t0);\n  return __d0;\n});\n",
    match: "<p id=\"w\">browser</p>",
    server: "<p id=\"w\"></p>",
    reports: [{ type: "text", expected: "browser", actual: "", path: "root > p > reactive" }],
  },
  {
    name: "second `<For>` row (plan replay)",
    source: "const rows = signal([{ id: 1, n: 'a' }, { id: 2, n: 'b' }])\nexport const App = () => h('ul', null, h(For, { each: rows, by: (r) => r.id }, (r) => <li>Row {r.n}</li>))",
    compiled: "const rows = signal([{ id: 1, n: \"a\" }, { id: 2, n: \"b\" }]);\nconst App = () => h(\"ul\", null, h(For, { each: rows, by: (r) => r.id }, (r) => _tpl(\"<li></li>\", (__root) => {\n  _setChild(__root, _fuse(\"Row \", r.n));\n  return null;\n})));\n",
    match: "<ul><!--pyreon-for--><li>Row a</li><li>Row b</li><!--/pyreon-for:1 2--></ul>",
    server: "<ul><!--pyreon-for--><li>Row a</li><li>Row x</li><!--/pyreon-for:1 2--></ul>",
    reports: [{ type: "text", expected: "Row b", actual: "Row x", path: "root > ul > li > text" }],
  },
  {
    name: "template root tag (swap)",
    source: "export const App = () => <p class=\"x\">t</p>",
    compiled: "const App = () => _tpl('<p class=\"x\">t</p>', () => null);\n",
    match: "<p class=\"x\">t</p>",
    server: "<section class=\"x\">t</section>",
    reports: [{ type: "tag", expected: "p", actual: "section", path: "root > p" }],
  },
  {
    name: "static template text (swap)",
    source: "export const App = () => <p>new text</p>",
    compiled: "const App = () => _tpl(\"<p>new text</p>\", () => null);\n",
    match: "<p>new text</p>",
    server: "<p>old text</p>",
    reports: [{ type: "text", expected: "new text", actual: "old text", path: "root > p > text" }],
  },
  {
    name: "nested element tag (swap)",
    source: "export const App = () => <div><b>a</b></div>",
    compiled: "const App = () => _tpl(\"<div><b>a</b></div>\", () => null);\n",
    match: "<div><b>a</b></div>",
    server: "<div><span>a</span></div>",
    reports: [{ type: "tag", expected: "b", actual: "span", path: "root > div > b" }],
  },
  {
    name: "slot content (`_mountSlot`, reported by the h() walk)",
    source: "const on = signal(true)\nexport const App = () => <div>{on() ? <b>x</b> : 'text'}</div>",
    compiled: "const on = signal(true);\nconst App = () => _tpl(\"<div><!></div>\", (__root) => {\n  const __p0 = __root.firstChild;\n  const __d0 = _mountSlot(() => on() ? /* @__PURE__ */ h(\"b\", null, \"x\") : \"text\", __root, __p0, true);\n  return __d0;\n});\n",
    match: "<div><b>x</b></div>",
    server: "<div><i>x</i></div>",
    reports: [{ type: "tag", expected: "b", actual: "i", path: "root > div > reactive > b" }],
  },
]

/**
 * Attributes are NOT reported, on either path: the h() walk applies props over
 * the server's attributes without comparing them, and the compiled binders
 * follow the same rule. Locked so a change to that is deliberate.
 */
export const ATTRIBUTE_CASE: CompiledMismatchCase = {
  name: 'class attribute (`_bindDirect` + `_setClass`)',
  source: "const c = signal('client')\nexport const App = () => <p class={c()}>t</p>",
  compiled: "const c = signal(\"client\");\nconst App = () => _tpl(\"<p>t</p>\", (__root) => {\n  const __d0 = _bindDirect(c, (v) => _setClass(__root, v));\n  return __d0;\n});\n",
  match: "<p class=\"client\">t</p>",
  server: '<p class="server">t</p>',
  reports: [],
}

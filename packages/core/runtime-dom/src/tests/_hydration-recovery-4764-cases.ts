/**
 * Real compiler emit and real server HTML for the #4764 Chromium twin, which
 * can run neither the compiler nor `renderToString`. `hydration-recovery-4764`
 * (happy-dom) regenerates every string from the real pipeline and fails if one
 * drifts.
 */

/** A `<For>` inside a reactive range, after a static `{v}`. */
export const FOR_IN_RANGE_SRC =
  'const App = () => <div>{v}{() => show() ? <For each={() => rows()} by={(r) => r}>{(r) => <li>{r}</li>}</For> : null}<span>after</span></div>'

/** `FOR_IN_RANGE_SRC` through the client compiler, JSX lowered to `h()`. */
export const FOR_IN_RANGE_COMPILED =
  'const App = () => _tpl("<div><!><!><span>after</span></div>", (__root) => {\n  const __p0 = __root.firstChild;\n  const __p1 = __p0.nextSibling;\n  _setChildAt(__root, __p0, v);\n  const __d0 = _mountSlot(() => show() ? /* @__PURE__ */ h(For, { each: () => rows(), by: (r) => r }, (r) => _tpl("<li></li>", (__root2) => {\n    _setChild(__root2, r);\n    return null;\n  })) : null, __root, __p1);\n  return __d0;\n});\n'

/** Server HTML of `FOR_IN_RANGE_SRC` with `v = [<b>1</b>, <b>2</b>]`, rows `[1, 2]`: the SSR compile. */
export const FOR_IN_RANGE_COMPILED_SERVER =
  '<div><!--$--><b>1</b><b>2</b><!--/$--><!--$--><!--pyreon-for--><li>1</li><li>2</li><!--/pyreon-for:1 2--><!--/$--><span>after</span></div>'

/** The same, rendered from the h() tree (`{v}` carries no range there). */
export const FOR_IN_RANGE_H_SERVER =
  '<div><b>1</b><b>2</b><!--$--><!--pyreon-for--><li>1</li><li>2</li><!--/pyreon-for:1 2--><!--/$--><span>after</span></div>'

/** A ref that clears an element whose template holds a `<!>` placeholder. */
export const CLEAR_REF_SRC =
  'const App = () => <p><span ref={(el) => { if (el) el.textContent = "" }}><s/>{vArr}</span></p>'

export const CLEAR_REF_COMPILED =
  'const App = () => _tpl("<p><span><s></s><!></span></p>", (__root) => {\n  const __e0 = __root.firstElementChild;\n  const __p0 = __e0.firstChild.nextSibling;\n  _setChildAt(__e0, __p0, vArr);\n  const __d0 = _ref(__e0, (el) => {\n    if (el) el.textContent = "";\n  });\n  return __d0;\n});\n'

/** A ref that appends to an element whose content is a marked reactive range. */
export const APPEND_REF_SRC =
  'const App = () => <p><span ref={(el) => { if (el) el.append(document.createElement("u")) }}><s/>{() => (on() ? <b>on</b> : <i>off</i>)}</span></p>'

export const APPEND_REF_COMPILED =
  'const App = () => _tpl("<p><span><s></s><!></span></p>", (__root) => {\n  const __e0 = __root.firstElementChild;\n  const __p0 = __e0.firstChild.nextSibling;\n  const __d1 = _mountSlot(() => on() ? _tpl("<b>on</b>", () => null) : _tpl("<i>off</i>", () => null), __e0, __p0);\n  const __d0 = _ref(__e0, (el) => {\n    if (el) el.append(document.createElement("u"));\n  });\n  return _dispose2(__d0, __d1);\n});\n'

/** Server HTML of `APPEND_REF_SRC` with `on() === true`. */
export const APPEND_REF_SERVER = '<p><span><s></s><!--$--><b>on</b><!--/$--></span></p>'

/**
 * The #4353 shape, recorded for the real-Chromium suite
 * (`hydrate-async-component-tpl-adoption.browser.test.tsx`), which cannot run
 * the compiler or `renderToString` in the page. The happy-dom twin
 * (`hydrate-async-component-tpl-adoption.test.tsx`) regenerates both strings
 * through the real toolchain and fails on any drift.
 *
 * `S` is the module's one free variable: `wait()` is the body's `await`,
 * `heading` a signal (bound with `_bindText`), `description` a static string
 * (written with `_setChild`).
 */
export const ASYNC_TPL_CASE = {
  source:
    'export const App = async () => {\n  await S.wait()\n  return (\n    <div class="b">\n      <header class="h">\n        <h1 class="t">{S.heading()}</h1>\n        <p class="d">{S.description}</p>\n      </header>\n    </div>\n  )\n}',
  /** `transformJSX(source)`, imports stripped, lowered by esbuild. */
  compiled:
    'const App = async () => {\n  await S.wait();\n  return _tpl(\'<div class="b"><header class="h"><h1 class="t"> </h1><p class="d"></p></header></div>\', (__root) => {\n    const __e0 = __root.firstElementChild.firstElementChild;\n    const __t1 = __e0.firstChild;\n    const __e2 = __e0.nextElementSibling;\n    const __d0 = _bindText(S.heading, __t1, void 0, S);\n    _setChild(__e2, S.description);\n    return __d0;\n  });\n};\n',
  /** `renderToString` of the SSR build with `heading() === 'Blog'`, `description === 'Notes'`. */
  html: '<!--$pas--><div class="b"><header class="h"><h1 class="t">Blog</h1><p class="d">Notes</p></header></div><!--$pae-->',
  /** The same, rendered inside `<Suspense fallback={null}>`. */
  suspenseHtml:
    '<!--$--><!--$pas--><div class="b"><header class="h"><h1 class="t">Blog</h1><p class="d">Notes</p></header></div><!--$pae--><!--/$-->',
}

// Dev JSX entry (`<pkg>/jsx-dev-runtime`). In dev, OXC's automatic runtime
// imports `jsxDEV` from here; the build ships this file as its own
// `lib/jsx-dev-runtime.js`, sharing one module instance (one render context)
// with `lib/jsx-runtime.js` through a common chunk.
export { Fragment, jsx, jsxDEV, jsxs } from './jsx-runtime'

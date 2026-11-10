// `<pkg>/jsx-dev-runtime` is built from `src/jsx-dev-runtime.ts` (the build
// derives each entry from its export key). In dev, OXC's automatic runtime
// imports `jsxDEV` from the JSX source, so the dev entry must export it — and
// it must be the SAME function as the production runtime's, so dev and
// production JSX share one render context. #4283: the published entry had no
// `jsxDEV`, and `vite` dev failed for every consumer.
import * as dev from '../jsx-dev-runtime'
import * as prod from '../jsx-runtime'

describe('jsx-dev-runtime', () => {
  it('exports jsxDEV, jsx, jsxs and Fragment from the production runtime', () => {
    expect(typeof dev.jsxDEV).toBe('function')
    expect(dev.jsxDEV).toBe(prod.jsx)
    expect(dev.jsx).toBe(prod.jsx)
    expect(dev.jsxs).toBe(prod.jsxs)
    expect(dev.Fragment).toBe(prod.Fragment)
  })
})

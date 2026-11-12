// The `./transition` and `./keep-alive` subpaths ship what the build makes of
// `src/transition.ts` and `src/keep-alive.ts` (the build derives each entry
// from its export key). These are the files a consumer of
// `@pyreon/runtime-dom/transition` actually gets, so they must carry the
// subpath's documented surface. #4283: the published `./transition` had no
// `TransitionGroup`, because the workspace resolved a different entry file.
import * as keepAlive from '../keep-alive'
import * as transition from '../transition'

describe('runtime-dom subpath entries', () => {
  it('./transition exports Transition and TransitionGroup', () => {
    expect(typeof transition.Transition).toBe('function')
    expect(typeof transition.TransitionGroup).toBe('function')
  })

  it('./keep-alive exports KeepAlive', () => {
    expect(typeof keepAlive.KeepAlive).toBe('function')
  })
})

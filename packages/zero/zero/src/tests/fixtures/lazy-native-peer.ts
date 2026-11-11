// Fixture for ssr-build-optional-peers.test.ts. It sits inside @pyreon/zero,
// so a bare `sharp` resolves from zero's own node_modules but NOT from the
// test's app root — the workspace layout that made Vite bundle the peer.
// `ns` forces a namespace object, so the bundle needs rolldown's shared
// `__exportAll` helper — the helper that landed in the sharp chunk.
import * as ns from './lazy-native-peer-ns'

export const helpers = ns

export async function loadSharp(): Promise<unknown> {
  const m = await import('sharp')
  return m.default ?? m
}

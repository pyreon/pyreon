// Server entry: renders TodayApp to HTML. scripts/prerender.ts writes the
// result into dist/index.html, which the client entry then hydrates.
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { TodayApp } from '../../native-showcase/src/TodayApp'

export function render(): Promise<string> {
  return renderToString(h(TodayApp, {}))
}

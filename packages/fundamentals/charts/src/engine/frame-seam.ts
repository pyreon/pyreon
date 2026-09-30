// The server first-frame serializer, as a registration slot.
//
// `<Chart>` renders its first frame as SVG on the server so an SSR / SSG page
// shows the chart before any script runs. The SVG serializer is ~2 KB gzipped
// that no CLIENT needs — importing it from the chart host put it in every
// browser bundle. Instead `@pyreon/charts/svg` (the server-side entry) fills
// this slot when imported, and a server that never imports it ships no
// first frame (the accessible table is in the HTML either way).
import type { DrawCmd, MeasureText } from './types'

export interface FrameSerializer {
  measure: () => MeasureText
  svg: (cmds: DrawCmd[], width: number, height: number, options: { fontFamily: string; idPrefix: string }) => string
}

let serializer: FrameSerializer | null = null

/** Called by `@pyreon/charts/svg` on import. */
export function setFrameSerializer(s: FrameSerializer): void {
  serializer = s
}

/** The registered serializer, or null when the server never imported `@pyreon/charts/svg`. */
export function getFrameSerializer(): FrameSerializer | null {
  return serializer
}

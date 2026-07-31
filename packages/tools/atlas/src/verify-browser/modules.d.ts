/**
 * `pngjs` ships no type declarations. The runner consumes exactly one shape
 * from it (`PNG.sync.read` → raw RGBA), typed structurally at the call site in
 * `runner.ts:diffPngs` — so a full ambient module would just duplicate that.
 */
declare module 'pngjs' {
  export const PNG: {
    sync: { read(buf: Buffer): { width: number; height: number; data: Buffer } }
  }
}

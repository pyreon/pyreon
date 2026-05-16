declare module 'sharp' {
  interface SharpInstance {
    resize(width: number, height?: number, options?: { fit?: string }): SharpInstance
    webp(options?: { quality?: number }): SharpInstance
    avif(options?: { quality?: number }): SharpInstance
    jpeg(options?: { quality?: number; mozjpeg?: boolean }): SharpInstance
    png(options?: { compressionLevel?: number }): SharpInstance
    blur(sigma?: number): SharpInstance
    toFile(path: string): Promise<void>
    toBuffer(): Promise<Buffer>
    metadata(): Promise<{ width?: number; height?: number; format?: string }>
    /**
     * Image statistics. `dominant` is the histogram-mode RGB swatch —
     * the basis of the `'color'` / `'dominant-color'` placeholder
     * strategy (a flat-fill SVG, not a muddy channel average).
     */
    stats(): Promise<{ dominant: { r: number; g: number; b: number } }>
  }

  function sharp(input: string | Buffer): SharpInstance
  export default sharp
}

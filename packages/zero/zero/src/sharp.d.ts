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
  }

  function sharp(input: string | Buffer): SharpInstance
  export default sharp
}

interface Signature {
  type: string
  /** Bytes to match, with `null` as "any byte". */
  at: number
  bytes: readonly (number | null)[]
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))

/**
 * The file types `sniffType` recognises, by magic number: PNG, JPEG, GIF, WebP, BMP, ICO, TIFF, AVIF and HEIC, PDF, ZIP (also
 * DOCX, XLSX, PPTX, JAR, APK), GZIP, 7z, RAR, MP4 and MOV, WebM and MKV, MP3, OGG, WAV, FLAC, Windows executables (MZ) and
 * ELF binaries, and SVG (by its text). An unknown file gives `null`.
 */
const SIGNATURES: readonly Signature[] = [
  { type: 'image/png', at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', at: 0, bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', at: 0, bytes: ascii('GIF8') },
  { type: 'image/webp', at: 8, bytes: ascii('WEBP') },
  { type: 'image/bmp', at: 0, bytes: ascii('BM') },
  { type: 'image/x-icon', at: 0, bytes: [0, 0, 1, 0] },
  { type: 'image/tiff', at: 0, bytes: [0x49, 0x49, 0x2a, 0] },
  { type: 'image/tiff', at: 0, bytes: [0x4d, 0x4d, 0, 0x2a] },
  { type: 'image/avif', at: 4, bytes: ascii('ftypavif') },
  { type: 'image/heic', at: 4, bytes: ascii('ftypheic') },
  { type: 'application/pdf', at: 0, bytes: ascii('%PDF-') },
  { type: 'application/zip', at: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { type: 'application/zip', at: 0, bytes: [0x50, 0x4b, 0x05, 0x06] },
  { type: 'application/gzip', at: 0, bytes: [0x1f, 0x8b] },
  { type: 'application/x-7z-compressed', at: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { type: 'application/vnd.rar', at: 0, bytes: ascii('Rar!') },
  { type: 'video/mp4', at: 4, bytes: ascii('ftyp') },
  { type: 'video/webm', at: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { type: 'audio/mpeg', at: 0, bytes: ascii('ID3') },
  { type: 'audio/mpeg', at: 0, bytes: [0xff, 0xfb] },
  { type: 'audio/ogg', at: 0, bytes: ascii('OggS') },
  { type: 'audio/wav', at: 8, bytes: ascii('WAVE') },
  { type: 'audio/flac', at: 0, bytes: ascii('fLaC') },
  { type: 'application/x-msdownload', at: 0, bytes: ascii('MZ') },
  { type: 'application/x-elf', at: 0, bytes: [0x7f, 0x45, 0x4c, 0x46] },
]

function matches(head: Uint8Array, sig: Signature): boolean {
  return head.length >= sig.at + sig.bytes.length && sig.bytes.every((b, i) => b === null || head[sig.at + i] === b)
}

/**
 * The type named by the first bytes of a buffer, or `null`. Pure; `sniffType` reads the bytes from a file.
 *
 * @example sniffBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) // => 'image/jpeg'
 */
export function sniffBytes(head: Uint8Array): string | null {
  for (const sig of SIGNATURES) if (matches(head, sig) && !(sig.type === 'video/mp4' && /^ftyp(avif|heic)/.test(String.fromCharCode(...head.slice(4, 12))))) return sig.type
  const text = String.fromCharCode(...head.slice(0, 256)).trimStart().toLowerCase()

  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) return 'image/svg+xml'

  return null
}

/**
 * The real type of a file by its first bytes (magic numbers), so `accept: image/*` is not fooled by a renamed `.exe`. It reads 
 * 264 bytes with `Blob.slice`, never the whole file. Only the common types are known (see the list on `SIGNATURES`); an unknown
 * file, an empty one or a text file gives `null`, which means "cannot tell", not "safe". This is a client-side convenience:
 * the server must check the content itself.
 *
 * @example sniffBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) // => 'image/png'
 * @example sniffBytes(new Uint8Array([104, 101, 108, 108, 111])) // => null
 */
export async function sniffType(file: Blob): Promise<string | null> {
  const buffer = await file.slice(0, 264).arrayBuffer()

  return sniffBytes(new Uint8Array(buffer))
}

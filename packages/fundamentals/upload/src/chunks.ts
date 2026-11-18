/** One part of a file: bytes `[start, end)`. */
export interface Chunk {
  index: number
  start: number
  end: number
}

function check(fn: string, size: number, chunkSize: number): void {
  if (!Number.isFinite(size) || size < 0) throw new RangeError(`[Pyreon] ${fn}: size must be a finite number of bytes from 0, got ${String(size)}.`)
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new RangeError(`[Pyreon] ${fn}: chunkSize must be a whole number of bytes from 1, got ${String(chunkSize)}.`)
}

/**
 * How many parts a file has. An empty file has one (empty) part, so a transport still sends something.
 *
 * @example chunkCount(10, 4) // => 3
 * @example chunkCount(0, 4) // => 1
 */
export function chunkCount(size: number, chunkSize: number): number {
  check('chunkCount', size, chunkSize)

  return Math.max(1, Math.ceil(size / chunkSize))
}

/** The byte range of part `index`; throws for an index outside the file. */
export function chunkRange(size: number, chunkSize: number, index: number): Chunk {
  check('chunkRange', size, chunkSize)
  if (!Number.isInteger(index) || index < 0 || index >= chunkCount(size, chunkSize)) throw new RangeError(`[Pyreon] chunkRange: index ${String(index)} is outside the ${chunkCount(size, chunkSize)} parts of a ${size}-byte file.`)

  return { index, start: index * chunkSize, end: Math.min(size, (index + 1) * chunkSize) }
}

/**
 * The parts of a file, lazily (a 1 TB file in 5 MB parts is 200,000 parts and is never held as an array). The file itself is
 * never read: slice it with `Blob.slice(chunk.start, chunk.end)` when a part is sent.
 *
 * @example [...planChunks(10, 4)].map((c) => [c.start, c.end]) // => [[0, 4], [4, 8], [8, 10]]
 */
export function* planChunks(size: number, chunkSize: number): Generator<Chunk, void, undefined> {
  const n = chunkCount(size, chunkSize)

  for (let i = 0; i < n; i++) yield { index: i, start: i * chunkSize, end: Math.min(size, (i + 1) * chunkSize) }
}

/** A part size that keeps a file within `maxParts` parts (S3 allows 10,000), never below `minSize`. */
export function suggestChunkSize(size: number, options?: { minSize?: number; maxParts?: number }): number {
  const min = options?.minSize ?? 5 * 1024 * 1024
  const parts = options?.maxParts ?? 10_000

  check('suggestChunkSize', size, Math.max(1, min))

  return Math.max(min, Math.ceil(size / parts))
}

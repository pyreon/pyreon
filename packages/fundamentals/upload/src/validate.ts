import { matchesAccept } from './accept'
import { formatSize, parseSize } from './size'
import { sniffType } from './sniff'
import type { FileRejection, FileRule } from './types'

type Candidate = File | Blob

const nameOf = (f: Candidate): string => (f as File).name ?? ''

function rejection(code: FileRejection['code'], message: string, params: Record<string, unknown> = {}): FileRejection {
  return { code, message, params }
}

/** The checks that need only the file's name, size and type. */
function syncChecks(file: Candidate, rules: FileRule): FileRejection[] {
  const out: FileRejection[] = []
  const name = nameOf(file)

  if (rules.maxSize !== undefined) {
    const max = parseSize(rules.maxSize, 'validateFile')

    if (file.size > max) out.push(rejection('too-large', `The file is ${formatSize(file.size)}; the limit is ${formatSize(max)}.`, { size: file.size, max, name }))
  }
  if (rules.minSize !== undefined) {
    const min = parseSize(rules.minSize, 'validateFile')

    if (file.size < min) out.push(rejection('too-small', `The file is ${formatSize(file.size)}; at least ${formatSize(min)} is needed.`, { size: file.size, min, name }))
  }
  if (rules.accept !== undefined && !matchesAccept({ name, type: file.type }, rules.accept)) {
    out.push(rejection('type', `Files of this type are not accepted (allowed: ${rules.accept.join(', ')}).`, { type: file.type, accept: rules.accept, name }))
  }

  return out
}

type ImageRule = NonNullable<FileRule['image']>

function dimensionProblems(w: number, h: number, rule: ImageRule): string[] {
  const out: string[] = []

  if (rule.maxWidth !== undefined && w > rule.maxWidth) out.push(`at most ${rule.maxWidth} px wide`)
  if (rule.maxHeight !== undefined && h > rule.maxHeight) out.push(`at most ${rule.maxHeight} px high`)
  if (rule.minWidth !== undefined && w < rule.minWidth) out.push(`at least ${rule.minWidth} px wide`)
  if (rule.minHeight !== undefined && h < rule.minHeight) out.push(`at least ${rule.minHeight} px high`)
  if (rule.aspect !== undefined && h > 0) {
    const ratio = w / h
    const { min, max } = typeof rule.aspect === 'number' ? { min: rule.aspect * 0.99, max: rule.aspect * 1.01 } : rule.aspect

    if ((min !== undefined && ratio < min) || (max !== undefined && ratio > max)) out.push('of a different shape')
  }

  return out
}

/** Decode an image to read its size. Needs a browser; elsewhere the image cannot be read and is rejected. */
async function imageSize(file: Candidate): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      const size = { width: bitmap.width, height: bitmap.height }

      bitmap.close()

      return size
    }
  } catch {
    return null
  }

  return null
}

async function asyncChecks(file: Candidate, rules: FileRule): Promise<FileRejection[]> {
  const out: FileRejection[] = []
  const name = nameOf(file)

  const mimePatterns = rules.accept?.filter((p) => !p.startsWith('.')) ?? []

  if (rules.sniff === true && mimePatterns.length > 0) {
    // An extension pattern cannot be checked against a sniffed type, so only MIME patterns count here.
    const real = await sniffType(file)

    if (real !== null && !matchesAccept({ name: '', type: real }, mimePatterns)) out.push(rejection('type', `The content of this file is ${real}, which is not accepted.`, { type: file.type, sniffed: real, accept: rules.accept, name }))
  }
  if (rules.image !== undefined) {
    const size = await imageSize(file)

    if (size === null) out.push(rejection('dimensions', 'The image could not be read.', { name }))
    else {
      const problems = dimensionProblems(size.width, size.height, rules.image)

      if (problems.length > 0) out.push(rejection('dimensions', `The image is ${size.width} x ${size.height}; it must be ${problems.join(' and ')}.`, { ...size, ...rules.image, name }))
    }
  }

  return out
}

async function customCheck(file: Candidate, custom: NonNullable<FileRule['custom']>): Promise<FileRejection[]> {
  try {
    const message = await custom(file)

    return message === null || message === undefined ? [] : [rejection('custom', message, { name: nameOf(file) })]
  } catch (error) {
    return [rejection('custom', error instanceof Error ? error.message : 'The file was not accepted.', { name: nameOf(file) })]
  }
}

/**
 * Check one file against rules. The answer is an array of rejections (empty means accepted) and is available synchronously
 * unless a rule has to look inside the file (`image`, `sniff`) or call an async `custom`; then it is a Promise. Rejections carry a
 * `code`, a plain English `message` and `params` (sizes, limits, names) so an app can translate with its own i18n. `maxFiles` is
 * a rule of a queue, see `validateFiles`.
 *
 * @example validateFile({ name: 'a.png', size: 5, type: 'image/png' } as File, { maxSize: 10 }) // => []
 * @example validateFile({ name: 'a.png', size: 50, type: 'image/png' } as File, { maxSize: '10 B' })[0].code // => 'too-large'
 */
export function validateFile(file: Candidate, rules: FileRule): FileRejection[] | Promise<FileRejection[]> {
  if (typeof rules !== 'object' || rules === null) throw new TypeError(`[Pyreon] validateFile: expected rules to be an object such as { maxSize: "10 MB" }, got ${String(rules)}.`)
  if (typeof file !== 'object' || file === null || typeof file.size !== 'number' || Number.isNaN(file.size) || typeof file.type !== 'string' || (nameOf(file) !== '' && typeof nameOf(file) !== 'string')) throw new TypeError(`[Pyreon] validateFile: expected a File or Blob, got ${String(file)}.`)
  if (rules.accept !== undefined && (!Array.isArray(rules.accept) || rules.accept.some((p) => typeof p !== 'string'))) throw new TypeError(`[Pyreon] validateFile: expected accept to be an array of strings such as ["image/*", ".pdf"], got ${JSON.stringify(rules.accept)}.`)
  if (rules.custom !== undefined && typeof rules.custom !== 'function') throw new TypeError('[Pyreon] validateFile: expected custom to be a function (file) => message | null.')
  const sync = syncChecks(file, rules)

  if (rules.image === undefined && rules.sniff !== true && rules.custom === undefined) return sync

  return (async () => {
    const more = await asyncChecks(file, rules)
    const own = rules.custom === undefined ? [] : await customCheck(file, rules.custom)

    return [...sync, ...more, ...own]
  })()
}

/** `validateFile` as a Promise, whichever way it answers. */
export async function validateFileAsync(file: Candidate, rules: FileRule): Promise<FileRejection[]> {
  return validateFile(file, rules)
}

/**
 * Check a batch: each file's own rules, and `maxFiles` across the batch (counting `existing` files already accepted). Files past
 * the limit are rejected as `too-many`, in order. Always returns one array of rejections per file.
 */
export async function validateFiles(files: readonly Candidate[], rules: FileRule, existing = 0): Promise<FileRejection[][]> {
  const max = rules.maxFiles
  const results = await Promise.all(files.map((f) => validateFile(f, rules)))
  let accepted = existing

  return results.map((r) => {
    if (r.length > 0) return r
    if (max !== undefined && accepted >= max) return [rejection('too-many', `At most ${max} ${max === 1 ? 'file is' : 'files are'} allowed.`, { max })]
    accepted++

    return r
  })
}

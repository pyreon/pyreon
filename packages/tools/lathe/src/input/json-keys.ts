/**
 * Duplicate keys in a JSON document.
 *
 * `JSON.parse` keeps the LAST of two same-named keys and says nothing, so a
 * spec whose `components.schemas` names `Pet` twice silently loses the first
 * definition -- and everything the generated client derives from it. The YAML
 * reader refuses duplicates outright; this reports them for JSON, where the
 * document otherwise parses fine and refusing it would block a spec a hundred
 * other tools accept.
 *
 * The scanner runs over text `JSON.parse` has ALREADY accepted, so it assumes
 * well-formed input and only tracks what it needs: the object/array nesting,
 * the current key path, and the keys seen per object.
 */

type Frame =
  | { kind: 'object'; path: string[]; keys: Set<string>; key: string | undefined }
  | { kind: 'array'; path: string[]; index: number }

/** One duplicated key: where it lives, as an RFC 6901 pointer (`#/a/b`). */
export interface DuplicateKey {
  /** Pointer to the key that was written more than once. */
  at: string
  /** The key, decoded. */
  key: string
}

/**
 * Every key written more than once in the same object, in document order.
 * Each duplicate is reported once, however many times it repeats.
 */
export function duplicateJsonKeys(text: string): DuplicateKey[] {
  const out: DuplicateKey[] = []
  const reported = new Set<string>()
  const stack: Frame[] = []
  // The path a VALUE starting now would live at.
  const valuePath = (): string[] => {
    const top = stack[stack.length - 1]
    if (!top) return []
    if (top.kind === 'array') return [...top.path, String(top.index)]
    return [...top.path, top.key ?? '']
  }
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i] as string
    if (c === '{') {
      stack.push({ kind: 'object', path: valuePath(), keys: new Set(), key: undefined })
      i++
    } else if (c === '[') {
      stack.push({ kind: 'array', path: valuePath(), index: 0 })
      i++
    } else if (c === '}' || c === ']') {
      stack.pop()
      i++
    } else if (c === ',') {
      const top = stack[stack.length - 1]
      if (top?.kind === 'array') top.index++
      else if (top?.kind === 'object') top.key = undefined
      i++
    } else if (c === '"') {
      let j = i + 1
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      const raw = text.slice(i, j + 1)
      i = j + 1
      const top = stack[stack.length - 1]
      // A string in KEY position is followed (after whitespace) by `:`.
      if (top?.kind === 'object' && top.key === undefined) {
        const key = JSON.parse(raw) as string
        top.key = key
        if (top.keys.has(key)) {
          const at = pointer([...top.path, key])
          if (!reported.has(at)) {
            reported.add(at)
            out.push({ at, key })
          }
        } else {
          top.keys.add(key)
        }
      }
    } else {
      i++
    }
  }
  return out
}

function pointer(path: readonly string[]): string {
  return `#/${path.map((seg) => seg.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`
}

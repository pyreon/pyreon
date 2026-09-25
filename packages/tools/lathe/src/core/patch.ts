/**
 * `patches` — correct a spec you do not own, before Lathe reads it.
 *
 * Vendor specs are wrong in small ways all the time: a field the server
 * actually returns as `null`, a missing `operationId`, an enum missing a value.
 * Editing the downloaded file works until the next `lathe pull` overwrites the
 * fix. A patch lives in the config instead, is reapplied to every pull, and
 * FAILS LOUDLY the day the vendor changes the spot it targets — which is the
 * moment the patch needs a human to look at it again.
 *
 * The operations are the RFC 6902 subset that covers corrections: `add`,
 * `replace`, `remove`. Paths are RFC 6901 JSON pointers, and the `#/…` form
 * the report prints in every note is accepted as-is, so a note's location can
 * be pasted straight into a patch.
 */

import { closest } from './suggest'

/** One correction — see `LatheSection.patches`. */
export type LatheSpecPatch =
  | {
      /** Set a value; the parent must exist. On an array, `-` appends and an index inserts. */
      op: 'add'
      /** RFC 6901 pointer (`/paths/~1pets/get/operationId`), with or without a leading `#`. */
      path: string
      value: unknown
    }
  | {
      /** Replace a value that must already exist. */
      op: 'replace'
      path: string
      value: unknown
    }
  | {
      /** Delete a value that must already exist. */
      op: 'remove'
      path: string
    }

/** Split a pointer into unescaped segments, or say why it is not one. The root (`''`) has none. */
function pointerSegments(pointer: string): string[] | string {
  const p = pointer.startsWith('#') ? decodeURIComponent(pointer.slice(1)) : pointer
  if (p === '') return []
  if (!p.startsWith('/')) return `a JSON pointer starts with \`/\`; got \`${pointer}\``
  return p
    .slice(1)
    .split('/')
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'))
}

/** Split an RFC 6901 pointer (with or without a leading `#`) into unescaped segments. */
export function parsePointer(pointer: string): string[] {
  const segs = pointerSegments(pointer)
  if (typeof segs === 'string') throw new Error(`[Pyreon] lathe: ${segs}`)
  return segs
}

type Container = Record<string, unknown> | unknown[]

const isContainer = (v: unknown): v is Container => v !== null && typeof v === 'object'

/**
 * Apply `patches` to a parsed spec, in order, IN PLACE (the caller owns a
 * fresh parse). Values are copied, so a config object shared between projects
 * is never aliased into two documents.
 */
export function applyPatches(spec: Record<string, unknown>, patches: readonly LatheSpecPatch[] | undefined): void {
  if (!patches) return
  patches.forEach((patch, i) => {
    const where = `patches[${i}]`
    const fail = (why: string): never => {
      throw new Error(`[Pyreon] lathe: \`${where}\` (${patch.op} \`${patch.path}\`): ${why}`)
    }
    if (patch === null || typeof patch !== 'object') fail('must be an object like `{ op, path, value }`.')
    if (patch.op !== 'add' && patch.op !== 'replace' && patch.op !== 'remove') {
      fail(`\`op\` must be add, replace or remove; got \`${String((patch as { op: unknown }).op)}\`.`)
    }
    if (typeof patch.path !== 'string') fail('`path` must be a JSON pointer string.')
    const parsed = pointerSegments(patch.path)
    if (typeof parsed === 'string') return fail(parsed)
    const segs = parsed
    if (segs.length === 0) fail('the root cannot be patched; target a key inside the document.')
    if (patch.op !== 'remove' && (!('value' in patch) || patch.value === undefined)) {
      fail('needs a `value` (JSON — use `null` for null).')
    }

    // Walk to the PARENT, naming the first segment that is missing.
    let parent: unknown = spec
    for (const [depth, seg] of segs.slice(0, -1).entries()) {
      // OWN keys only: `/__proto__/x` must not walk into Object.prototype.
      const next = isContainer(parent) && Object.hasOwn(parent, seg) ? (parent as Record<string, unknown>)[seg] : undefined
      if (!isContainer(next)) {
        const at = `/${segs.slice(0, depth + 1).join('/')}`
        const siblings = isContainer(parent) && !Array.isArray(parent) ? Object.keys(parent) : []
        const best = closest(seg, siblings)
        fail(`\`${at}\` does not exist in the spec${best ? ` — did you mean \`${best}\`?` : ''}. The spec may have changed since this patch was written.`)
      }
      parent = next
    }
    const last = segs[segs.length - 1] as string
    const value = patch.op === 'remove' ? undefined : (JSON.parse(JSON.stringify(patch.value)) as unknown)

    if (Array.isArray(parent)) {
      const index = last === '-' ? parent.length : Number(last)
      if (!/^(0|[1-9][0-9]*|-)$/.test(last) || index > parent.length || (patch.op !== 'add' && index >= parent.length)) {
        fail(`\`${last}\` is not an index of the array at that position (length ${parent.length}).`)
      }
      if (patch.op === 'add') parent.splice(index, 0, value)
      else if (patch.op === 'replace') parent[index] = value
      else parent.splice(index, 1)
      return
    }
    const obj = parent as Record<string, unknown>
    const exists = Object.hasOwn(obj, last)
    if (patch.op !== 'add' && !exists) {
      const best = closest(last, Object.keys(obj))
      fail(`there is no \`${last}\` to ${patch.op}${best ? ` — did you mean \`${best}\`?` : ''}. The spec may have changed since this patch was written.`)
    }
    if (patch.op === 'remove') delete obj[last]
    // `defineProperty`, not assignment: `obj.__proto__ = v` would set the
    // prototype instead of a key.
    else Object.defineProperty(obj, last, { value, writable: true, enumerable: true, configurable: true })
  })
}

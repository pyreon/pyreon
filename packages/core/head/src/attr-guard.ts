import {
  UNSAFE_ATTR_NAME_RE,
  isEventHandlerAttr,
  isSafeImageDataUri,
  isUnsafeUrl,
  isUrlAttr,
} from '@pyreon/core'

/**
 * The attribute guard for BOTH of `@pyreon/head`'s renderers — the SSR
 * serializer (`ssr.ts`) and the client DOM syncer (`dom.ts`).
 *
 * It lives in its own module for the reason the whole fix exists: head is a
 * serializer, it has two of them, and neither guarded anything. Putting the
 * predicate in one of the two would have reproduced the shape one layer down —
 * the `@pyreon/runtime-server` element renderer had exactly these checks, and
 * head not having them is what "a refusal applied on one sink" looks like.
 *
 * The predicates themselves come from `@pyreon/core`, so head reaches the SAME
 * verdict as the element renderer on the same markup rather than a second
 * opinion about it.
 */
export function isHeadAttrSafe(name: string, value: string, tagName: string): boolean {
  // STRUCTURE. A name carrying whitespace / quotes / `=` / `<` / `>` breaks out
  // of the attribute list, so a spread of a user-keyed object injects siblings:
  // `useHead({ meta: [{ 'name x="y" onload': 'z' }] })` serialized as
  // `<meta name x="y" onload="z" />` — three attributes from one key, the last
  // an inline handler. On the client the same name makes `setAttribute` throw
  // `InvalidCharacterError`, taking the head sync down with it.
  if (name.length === 0 || UNSAFE_ATTR_NAME_RE.test(name)) {
    warnDroppedHeadAttr(name, tagName, 'could break HTML structure')
    return false
  }
  // HANDLERS. `onload` on a `<link>` or `<script>` is executable markup, and a
  // preload / stylesheet is exactly where one fires.
  if (isEventHandlerAttr(name)) {
    warnDroppedHeadAttr(name, tagName, 'is an event-handler attribute')
    return false
  }
  // URLs. `<link href="javascript:…">` and `<script src="javascript:…">` were
  // both emitted verbatim. Same three checks in the same order as `renderProp`,
  // including refusing `data:` on a non-image-context tag — which every head tag
  // is, so a `data:` URI in `<head>` is refused exactly as it already was when
  // the same tag was rendered as an element.
  if (isUrlAttr(name) && isUnsafeUrl(value) && !isSafeImageDataUri(tagName, name, value)) {
    warnDroppedHeadAttr(name, tagName, 'is an unsafe URL')
    return false
  }
  return true
}

const warnDroppedHeadAttr: (name: string, tagName: string, why: string) => void =
  process.env.NODE_ENV === 'production'
    ? () => {}
    : (name, tagName, why) => {
        // oxlint-disable-next-line no-console
        console.warn(
          `[Pyreon Head] Attribute "${name}" on <${tagName}> ${why} and was DROPPED. ` +
            `If user-supplied data drives a head attribute name or a URL, validate it ` +
            `against an allowlist before passing it to useHead().`,
        )
      }

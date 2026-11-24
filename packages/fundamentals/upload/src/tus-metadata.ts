/** Internal: the tus `Upload-Metadata` header (not part of the public entry). */

const b64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''

  for (const b of bytes) binary += String.fromCharCode(b)

  return btoa(binary)
}

/**
 * The `Upload-Metadata` value: `key base64(value)` pairs joined by commas. A key may not contain a space or a comma (they are the
 * separators), nor a non-ASCII or control character: a key such as `a b,evil` would add a field of the caller's choosing to the
 * header, so it is rejected, never escaped. A value is base64, so it cannot carry a separator. Empty values are omitted.
 */
export function metadataHeader(meta: Record<string, string>): string {
  const pairs: string[] = []

  for (const [key, value] of Object.entries(meta)) {
    if (key === '' || !/^[\x21-\x2b\x2d-\x7e]+$/.test(key)) {
      throw new TypeError(`[Pyreon] tusTransport: the metadata key ${JSON.stringify(key)} is not allowed. A tus metadata key is printable ASCII without a space or a comma, such as "filename".`)
    }
    if (value !== '') pairs.push(`${key} ${b64(value)}`)
  }

  return pairs.join(',')
}

/**
 * The plugin's single entry to `oxc-parser`.
 *
 * oxc builds the AST in Rust, and the default `parseSync` hands it to JS as a
 * JSON string that `program` parses lazily. On the plugin's transform corpus
 * that JSON round-trip, not the parse, was the dominant cost. Raw transfer
 * instead decodes the AST straight out of a shared buffer: 3-4x faster on
 * Node, with a deep-equal result (verified byte-for-byte via JSON.stringify
 * over 1,271 repo files, with and without `preserveParens`).
 *
 * Raw transfer needs Node >= 22 or Deno >= 2 on a 64-bit little-endian host.
 * Bun and older Node are unsupported, and the option THROWS there rather
 * than degrading, so the capability is probed once and the default path is
 * kept for everything else.
 */
import { parseSync, rawTransferSupported } from 'oxc-parser'

type ParseOptions = NonNullable<Parameters<typeof parseSync>[2]>

const RAW_TRANSFER: boolean = (() => {
  try {
    return rawTransferSupported()
  } /* v8 ignore next 3 -- defensive: the probe is a pure capability check and is not expected to throw. */ catch {
    return false
  }
})()

export function parseOxc(
  filename: string,
  code: string,
  options: ParseOptions,
): ReturnType<typeof parseSync> {
  return _parseOxcWith(RAW_TRANSFER, filename, code, options)
}

/**
 * Both arms, selectable — so the parity test can run each on the same input
 * regardless of which one the host runtime would pick.
 *
 * @internal — exported for tests.
 */
export function _parseOxcWith(
  rawTransfer: boolean,
  filename: string,
  code: string,
  options: ParseOptions,
): ReturnType<typeof parseSync> {
  if (!rawTransfer) return parseSync(filename, code, options)
  // `experimentalRawTransfer` is read by oxc-parser's JS entry but absent from
  // its published `ParserOptions` declaration; widening through a typed
  // binding (not a cast) keeps every other field checked.
  const raw: ParseOptions & { experimentalRawTransfer: true } = {
    ...options,
    experimentalRawTransfer: true,
  }
  return parseSync(filename, code, raw)
}

/** @internal — exported for tests. */
export const _rawTransferActive: boolean = RAW_TRANSFER

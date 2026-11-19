/**
 * Prints the derived counts of this checkout as JSON (docs/src/site/derived.ts), for the content set's own scripts
 * (the share-image renderer in 09-site/assets reads the same placeholders the site build resolves):
 *
 *   bun docs/scripts/print-derived.ts > /tmp/derived.json
 *   PYREON_DERIVED=/tmp/derived.json node src/render-og.mjs …
 */
import { computeDerived } from '../src/site/derived'

process.stdout.write(`${JSON.stringify(computeDerived(), null, 2)}\n`)

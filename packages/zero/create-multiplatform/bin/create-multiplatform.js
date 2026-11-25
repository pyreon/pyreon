#!/usr/bin/env node
import('../lib/index.js')
  .then((m) => m.run(process.argv.slice(2)))
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    // Exit from the write's callback: an immediate `process.exit` can drop
    // stderr a pipe has not taken yet (#4799).
    process.stderr.write(`${String(err?.message ?? err)}\n`, () => process.exit(1))
  })

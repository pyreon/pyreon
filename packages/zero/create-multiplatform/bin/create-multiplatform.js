#!/usr/bin/env node
import('../lib/index.js')
  .then((m) => m.run(process.argv.slice(2)))
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error(String(err?.message ?? err))
    process.exit(1)
  })

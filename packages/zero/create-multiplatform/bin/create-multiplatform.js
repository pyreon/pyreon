#!/usr/bin/env node
import('../lib/index.js').then((m) => m.main(process.argv.slice(2))).catch((err) => {
  console.error(String(err?.message ?? err))
  process.exit(1)
})

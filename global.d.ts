/**
 * Minimal process type declaration — just enough for `process.env.NODE_ENV` checks.
 * Avoids requiring @types/node in browser-only consumers that import pyreon source
 * via the `"bun"` condition. The runtime guard `typeof process !== "undefined"` ensures
 * this is safe in browsers where `process` doesn't exist.
 */
declare var process: { env: { NODE_ENV?: string } }

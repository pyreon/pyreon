/**
 * Minimal process type — just enough for `process.env.NODE_ENV` checks.
 * Avoids requiring @types/node in consumers that import pyreon source
 * via the `"bun"` export condition.
 */
declare var process: { env: { NODE_ENV?: string } };

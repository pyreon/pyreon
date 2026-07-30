/**
 * `@pyreon/loom` — monorepo dependency observatory.
 *
 * Reads a workspace the way an install tool does and turns its dependency
 * fabric into DATA: the internal graph (depths, cycles, blast radius), the
 * external version-usage map, and a detector-driven issue list with honest
 * severities. `loom scan` writes the report + gates CI; `loom dev` serves
 * the observatory UI over the same model.
 *
 * NO singleton sentinel, deliberately (the atlas/lint/mcp/cli tool-package
 * precedent): loom is a tool that READS other projects — it never mounts
 * into an app heap where a duplicate-instance split matters.
 */
export * from './core/index'
